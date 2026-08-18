// Web Bluetooth client for live trainer data.
//
// Connects to a BLE Cycling Power Meter (Wahoo KICKR and most smart trainers
// broadcast the standard `cycling_power` GATT service) and, optionally, to a
// heart-rate broadcaster (a Garmin watch with "Broadcast HR" enabled exposes
// the standard `heart_rate` service).
//
// Why this works alongside a Garmin recording: Garmin watches typically drive
// trainers over ANT+, which leaves the trainer's BLE channel free. KICKR v5/v6
// and CORE also accept multiple simultaneous BLE connections, so even a
// BLE-controlled trainer usually still has a slot for the browser.
//
// Browser support: Chrome/Edge/Opera on desktop and Android. Not Safari/iOS.

// --- Minimal Web Bluetooth typings (avoids a @types/web dependency) ---------

type BluetoothServiceUUID = string;

interface BluetoothRemoteGATTCharacteristic {
  startNotifications(): Promise<BluetoothRemoteGATTCharacteristic>;
  stopNotifications(): Promise<BluetoothRemoteGATTCharacteristic>;
  addEventListener(type: "characteristicvaluechanged", listener: (event: Event) => void): void;
  removeEventListener(type: string, listener: (event: Event) => void): void;
}

interface BluetoothRemoteGATTService {
  getCharacteristic(uuid: BluetoothServiceUUID): Promise<BluetoothRemoteGATTCharacteristic>;
}

interface BluetoothRemoteGATTServer {
  connected: boolean;
  connect(): Promise<BluetoothRemoteGATTServer>;
  disconnect(): void;
  getPrimaryService(uuid: BluetoothServiceUUID): Promise<BluetoothRemoteGATTService>;
}

interface BluetoothDevice {
  name?: string;
  gatt?: BluetoothRemoteGATTServer;
  addEventListener(type: "gattserverdisconnected", listener: () => void): void;
  removeEventListener(type: "gattserverdisconnected", listener: () => void): void;
}

interface Bluetooth {
  requestDevice(options: {
    filters?: Array<{ services?: BluetoothServiceUUID[]; name?: string }>;
    optionalServices?: BluetoothServiceUUID[];
    acceptAllDevices?: boolean;
  }): Promise<BluetoothDevice>;
}

function bluetoothApi(): Bluetooth | null {
  const nav = navigator as Navigator & { bluetooth?: Bluetooth };
  return nav.bluetooth ?? null;
}

export function isTrainerSupported(): boolean {
  return typeof navigator !== "undefined" && bluetoothApi() !== null;
}

// --- Data model --------------------------------------------------------------

export type TrainerSample = {
  at: number; // epoch ms
  power: number; // watts (instantaneous)
  cadence: number | null; // rpm
  speed: number | null; // km/h
};

export type TrainerConnection = {
  deviceName: string;
  disconnect(): void;
};

// 700x25 road wheel circumference in metres, used when a trainer broadcasts
// wheel-revolution data. Smart trainers usually don't, so speed stays null.
const WHEEL_CIRCUMFERENCE_M = 2.105;

function wrapDelta(now: number, prev: number, bits: 16 | 32): number {
  const mod = bits === 16 ? 0x10000 : 0x100000000;
  return now >= prev ? now - prev : now + mod - prev;
}

// --- Cycling Power Measurement (0x2A63) parser --------------------------------

type CrankState = { revs: number; time: number; cadence: number | null };
type WheelState = { revs: number; time: number; speed: number | null };

function parsePowerMeasurement(
  value: DataView,
  crank: CrankState,
  wheel: WheelState,
): Omit<TrainerSample, "at"> {
  const flags = value.getUint16(0, true);
  const power = value.getInt16(2, true);
  let offset = 4;

  if (flags & 0x0001) offset += 1; // pedal power balance
  // bit 1 is a flag only, no data
  if (flags & 0x0004) offset += 2; // accumulated torque
  // bit 3 is a flag only, no data

  if (flags & 0x0010) {
    // wheel revolution data: cumulative revs uint32 + last event time uint16
    const revs = value.getUint32(offset, true);
    const time = value.getUint16(offset + 4, true); // 1/1024 s
    offset += 6;
    if (wheel.time !== 0 && time !== wheel.time) {
      const dRevs = wrapDelta(revs, wheel.revs, 32);
      const dTimeS = wrapDelta(time, wheel.time, 16) / 1024;
      if (dTimeS > 0) {
        wheel.speed = (dRevs * WHEEL_CIRCUMFERENCE_M * 3.6) / dTimeS;
      }
    }
    wheel.revs = revs;
    wheel.time = time;
  }

  if (flags & 0x0020) {
    // crank revolution data: cumulative revs uint16 + last event time uint16
    const revs = value.getUint16(offset, true);
    const time = value.getUint16(offset + 2, true); // 1/1024 s
    if (crank.time !== 0 && time !== crank.time) {
      const dRevs = wrapDelta(revs, crank.revs, 16);
      const dTimeS = wrapDelta(time, crank.time, 16) / 1024;
      if (dTimeS > 0 && dTimeS < 5) {
        crank.cadence = Math.round((dRevs * 60) / dTimeS);
      }
    }
    crank.revs = revs;
    crank.time = time;
  }

  return { power, cadence: crank.cadence, speed: wheel.speed };
}

// --- Heart Rate Measurement (0x2A37) parser -----------------------------------

function parseHeartRate(value: DataView): number {
  const flags = value.getUint8(0);
  return flags & 0x01 ? value.getUint16(1, true) : value.getUint8(1);
}

// --- Connections ---------------------------------------------------------------

export async function connectTrainer(
  onSample: (sample: TrainerSample) => void,
  onDisconnect: () => void,
): Promise<TrainerConnection> {
  const ble = bluetoothApi();
  if (!ble) throw new Error("bluetooth_unsupported");

  const device = await ble.requestDevice({
    filters: [{ services: ["cycling_power"] }],
    optionalServices: ["heart_rate", "battery_service", "device_information"],
  });
  const server = await device.gatt!.connect();
  const service = await server.getPrimaryService("cycling_power");
  const characteristic = await service.getCharacteristic(
    "00002a63-0000-1000-8000-00805f9b34fb", // Cycling Power Measurement
  );

  const crank: CrankState = { revs: 0, time: 0, cadence: null };
  const wheel: WheelState = { revs: 0, time: 0, speed: null };

  const listener = (event: Event) => {
    const target = event.target as unknown as { value: DataView };
    const parsed = parsePowerMeasurement(target.value, crank, wheel);
    onSample({ at: Date.now(), ...parsed });
  };
  characteristic.addEventListener("characteristicvaluechanged", listener);
  await characteristic.startNotifications();
  device.addEventListener("gattserverdisconnected", onDisconnect);

  return {
    deviceName: device.name ?? "Trainer",
    disconnect: () => {
      characteristic.removeEventListener("characteristicvaluechanged", listener);
      device.removeEventListener("gattserverdisconnected", onDisconnect);
      if (server.connected) server.disconnect();
    },
  };
}

export type HeartRateConnection = {
  deviceName: string;
  disconnect(): void;
};

export async function connectHeartRate(
  onHeartRate: (bpm: number) => void,
  onDisconnect: () => void,
): Promise<HeartRateConnection> {
  const ble = bluetoothApi();
  if (!ble) throw new Error("bluetooth_unsupported");

  const device = await ble.requestDevice({ filters: [{ services: ["heart_rate"] }] });
  const server = await device.gatt!.connect();
  const service = await server.getPrimaryService("heart_rate");
  const characteristic = await service.getCharacteristic(
    "00002a37-0000-1000-8000-00805f9b34fb", // Heart Rate Measurement
  );

  const listener = (event: Event) => {
    const target = event.target as unknown as { value: DataView };
    onHeartRate(parseHeartRate(target.value));
  };
  characteristic.addEventListener("characteristicvaluechanged", listener);
  await characteristic.startNotifications();
  device.addEventListener("gattserverdisconnected", onDisconnect);

  return {
    deviceName: device.name ?? "Heart rate",
    disconnect: () => {
      characteristic.removeEventListener("characteristicvaluechanged", listener);
      device.removeEventListener("gattserverdisconnected", onDisconnect);
      if (server.connected) server.disconnect();
    },
  };
}
