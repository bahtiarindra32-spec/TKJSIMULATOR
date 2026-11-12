// MikroTik RouterOS v7 device model (pure TS, no DOM). Fase 2 chunk A.
// Sources (notes/research-grow.md §1, numbers = its source list): ports/models [2][3], AP Router default config [4],
// first-time configuration commands and firewall rules [5], DHCP [8], queues [9], backup [10], hotspot [11].
// Every menu is a table of rows whose properties are kept as RouterOS strings, so add/set/print/export/find work the
// same way for every menu and a backup is a plain JSON copy. Anything not in the sources is marked "⚠ inferred".
import { parseIp, ipStr, networkOf, broadcastOf } from '../../game/missionLogic';

// ---------------------------------------------------------------- hardware
export type ModelId = 'RB941-2nD' | 'RB951Ui-2HnD';
export interface ModelDef {
  id: ModelId; name: string; ethers: number; wlan: boolean; poeOut: string; ramMB: number; storageMB: number; license: number; speed: string;
  /** /system resource: architecture-name, cpu, cpu-frequency (MHz) and storage type from the product page [2][3] */
  arch: string; cpu: string; cpuMHz: number; storageType: string;
  /** ⚠ inferred: share of RAM / flash still free on a v7 install (the sources do not give these) */
  freeMem: number; freeHdd: number;
}
export const MODELS: Record<ModelId, ModelDef> = {
  // hAP lite: 4× 10/100, 32 MB RAM, 16 MB flash, 2.4 GHz b/g/n, L4 [2]
  // SMIPS, QCA9533, 1 core 650 MHz, 16 MB FLASH (mikrotik.com/product/RB941-2nD, read Nov 2026)
  'RB941-2nD': { id: 'RB941-2nD', name: 'hAP lite', ethers: 4, wlan: true, poeOut: '', ramMB: 32, storageMB: 16, license: 4, speed: '100Mbps', arch: 'smips', cpu: 'QCA9533', cpuMHz: 650, storageType: 'FLASH', freeMem: 0.35, freeHdd: 0.2 },
  // RB951Ui-2HnD: 5× 10/100, ether5 passive PoE-out, 128 MB RAM, 128 MB NAND, 2.4 GHz b/g/n, L4 [3]
  // MIPSBE, AR9344, 1 core 600 MHz, 128 MB NAND (mikrotik.com/product/RB951Ui-2HnD, read Nov 2026)
  'RB951Ui-2HnD': { id: 'RB951Ui-2HnD', name: 'RB951Ui-2HnD', ethers: 5, wlan: true, poeOut: 'ether5', ramMB: 128, storageMB: 128, license: 4, speed: '100Mbps', arch: 'mipsbe', cpu: 'AR9344', cpuMHz: 600, storageType: 'NAND', freeMem: 0.75, freeHdd: 0.85 },
};
/** shown in the banner and the export header (⚠ design value: any v7 build; the sources do not pin one) */
export const ROS_VERSION = '7.16.2';
/** 10/100 ports on both models [2][3] */
export const PORT_BPS = 100_000_000;

// ---------------------------------------------------------------- rows and tables
export interface Row { id: number; disabled: boolean; dynamic: boolean; comment: string; p: Record<string, string> }
export type FieldType = 'str' | 'ip' | 'iplist' | 'cidr' | 'addr' | 'iface' | 'bridge' | 'enum' | 'multi' | 'bool' | 'num' | 'rate2' | 'time' | 'ranges' | 'mac' | 'ref' | 'gw' | 'ports';
export interface FieldDef {
  name: string; type: FieldType;
  /** enum / multi values */
  values?: string[];
  /** ref: table path the value names (by its key), plus extra literal values allowed */
  ref?: string; extra?: string[];
  def?: string; req?: boolean;
  /** a leading "!" negates the match (firewall) */
  neg?: boolean;
  /** read-only (shown, never set by the user) */
  ro?: boolean;
  /** not printed by print/export (passwords) */
  secret?: boolean;
}
export interface TableDef {
  path: string; fields: FieldDef[];
  /** field that names an item (set ether1 …, remove admin) */
  key?: string;
  add?: boolean; remove?: boolean; singleton?: boolean;
  /** strict order matters (firewall, queues): add accepts place-before */
  ordered?: boolean;
  /** automatic name prefix for add without name= (queue1, pool1, dhcp1 …) */
  auto?: string;
  /** print columns (table style) */
  cols?: string[];
  /** print as "detail" lines (firewall, queue) */
  detail?: boolean;
  /** a view over other tables (no rows of its own) */
  view?: boolean;
  /** extra commands of this menu */
  cmds?: string[];
}
const F = (name: string, type: FieldType, o: Partial<FieldDef> = {}): FieldDef => ({ name, type, ...o });
const yesno = ['yes', 'no'];
const ADDR = (n: string) => F(n, 'addr', { neg: true });
const IFN = (n: string) => F(n, 'iface', { neg: true });

export const TABLES: TableDef[] = [
  { path: '/interface', view: true, key: 'name', fields: [F('name', 'str'), F('mtu', 'num', { def: '1500' })], cols: ['NAME', 'TYPE', 'ACTUAL-MTU', 'MAC-ADDRESS'] },
  { path: '/interface ethernet', key: 'name', fields: [F('name', 'str'), F('default-name', 'str', { ro: true }), F('mtu', 'num', { def: '1500' }), F('mac-address', 'mac', { ro: true })], cols: ['NAME', 'MTU', 'MAC-ADDRESS'] },
  {
    path: '/interface wireless', key: 'name', cols: ['NAME', 'MODE', 'SSID', 'BAND', 'SECURITY-PROFILE'],
    fields: [F('name', 'str'), F('default-name', 'str', { ro: true }), F('mac-address', 'mac', { ro: true }),
      // ⚠ inferred factory values of the legacy wireless package (mode station, ssid MikroTik, band 2ghz-b)
      F('mode', 'enum', { values: ['ap-bridge', 'bridge', 'station', 'station-bridge', 'station-pseudobridge', 'wds-slave', 'alignment-only'], def: 'station' }),
      F('ssid', 'str', { def: 'MikroTik' }), F('band', 'enum', { values: ['2ghz-b', '2ghz-b/g', '2ghz-b/g/n', '2ghz-onlyg', '2ghz-onlyn', '2ghz-g/n'], def: '2ghz-b' }),
      F('security-profile', 'ref', { ref: '/interface wireless security-profiles', def: 'default' }),
      // accepted as typed (the [5] example sets them); not simulated
      F('frequency', 'str', { def: 'auto' }), F('channel-width', 'str', { def: '20mhz' }), F('wireless-protocol', 'str', { def: 'any' }), F('distance', 'str', { def: 'dynamic' }),
      F('frequency-mode', 'str', { def: 'regulatory-domain' }), F('country', 'str', { def: 'etsi' }), F('antenna-gain', 'num', { def: '0' })],
  },
  {
    path: '/interface wireless security-profiles', key: 'name', add: true, remove: true, auto: 'profile', cols: ['NAME', 'MODE', 'AUTHENTICATION-TYPES'],
    fields: [F('name', 'str'), F('mode', 'enum', { values: ['none', 'static-keys-required', 'static-keys-optional', 'dynamic-keys'], def: 'none' }),
      F('authentication-types', 'multi', { values: ['wpa-psk', 'wpa2-psk', 'wpa-eap', 'wpa2-eap'], def: '' }),
      F('wpa-pre-shared-key', 'str', { def: '', secret: true }), F('wpa2-pre-shared-key', 'str', { def: '', secret: true })],
  },
  { path: '/interface bridge', key: 'name', add: true, remove: true, auto: 'bridge', fields: [F('name', 'str'), F('protocol-mode', 'enum', { values: ['none', 'rstp', 'stp', 'mstp'], def: 'rstp' })], cols: ['NAME', 'PROTOCOL-MODE'] },
  { path: '/interface bridge port', add: true, remove: true, fields: [F('interface', 'iface', { req: true }), F('bridge', 'bridge', { req: true })], cols: ['INTERFACE', 'BRIDGE'] },
  { path: '/ip address', add: true, remove: true, fields: [F('address', 'cidr', { req: true }), F('network', 'ip', { ro: true }), F('interface', 'iface', { req: true })], cols: ['ADDRESS', 'NETWORK', 'INTERFACE'] },
  {
    path: '/ip dhcp-client', add: true, remove: true, cols: ['INTERFACE', 'USE-PEER-DNS', 'ADD-DEFAULT-ROUTE', 'STATUS', 'ADDRESS'],
    fields: [F('interface', 'iface', { req: true }), F('use-peer-dns', 'enum', { values: yesno, def: 'yes' }), F('add-default-route', 'enum', { values: ['yes', 'no', 'special-classless'], def: 'yes' }), F('default-route-distance', 'num', { def: '1' })],
  },
  { path: '/ip pool', key: 'name', add: true, remove: true, auto: 'pool', fields: [F('name', 'str'), F('ranges', 'ranges', { req: true })], cols: ['NAME', 'RANGES'] },
  {
    path: '/ip dhcp-server', key: 'name', add: true, remove: true, auto: 'dhcp', cmds: ['setup'], cols: ['NAME', 'INTERFACE', 'ADDRESS-POOL', 'LEASE-TIME'],
    // lease-time default 30m [8]
    fields: [F('name', 'str'), F('interface', 'iface', { req: true }), F('address-pool', 'ref', { ref: '/ip pool', extra: ['static-only'], def: 'static-only' }), F('lease-time', 'time', { def: '30m' })],
  },
  { path: '/ip dhcp-server network', add: true, remove: true, fields: [F('address', 'cidr', { req: true }), F('gateway', 'iplist', { def: '' }), F('dns-server', 'iplist', { def: '' })], cols: ['ADDRESS', 'GATEWAY', 'DNS-SERVER'] },
  {
    path: '/ip dhcp-server lease', add: true, remove: true, cmds: ['make-static'], cols: ['ADDRESS', 'MAC-ADDRESS', 'HOST-NAME', 'SERVER', 'RATE-LIMIT', 'STATUS'],
    fields: [F('address', 'ip', { req: true }), F('mac-address', 'mac', { req: true }), F('server', 'ref', { ref: '/ip dhcp-server', extra: ['all'], def: 'all' }), F('rate-limit', 'str', { def: '' }), F('host-name', 'str', { ro: true, def: '' })],
  },
  { path: '/ip dns', singleton: true, fields: [F('servers', 'iplist', { def: '' }), F('allow-remote-requests', 'enum', { values: yesno, def: 'no' })] },
  {
    path: '/ip firewall filter', add: true, remove: true, ordered: true, detail: true,
    fields: [F('chain', 'str', { req: true }), F('action', 'enum', { values: ['accept', 'drop', 'reject', 'fasttrack-connection', 'passthrough', 'log'], def: 'accept' }),
      F('connection-state', 'multi', { values: ['established', 'related', 'new', 'invalid', 'untracked'] }), F('connection-nat-state', 'multi', { values: ['srcnat', 'dstnat'], neg: true }),
      F('protocol', 'enum', { values: ['icmp', 'tcp', 'udp'] }), ADDR('src-address'), ADDR('dst-address'), F('src-port', 'ports'), F('dst-port', 'ports'), F('port', 'ports'),
      IFN('in-interface'), IFN('out-interface')],
  },
  {
    path: '/ip firewall nat', add: true, remove: true, ordered: true, detail: true,
    fields: [F('chain', 'str', { req: true }), F('action', 'enum', { values: ['masquerade', 'src-nat', 'dst-nat', 'redirect', 'accept', 'passthrough', 'netmap'], def: 'accept' }),
      F('protocol', 'enum', { values: ['icmp', 'tcp', 'udp'] }), ADDR('src-address'), ADDR('dst-address'), F('dst-port', 'ports'), F('port', 'ports'),
      IFN('in-interface'), IFN('out-interface'), F('to-addresses', 'ip'), F('to-ports', 'ports')],
  },
  { path: '/ip route', add: true, remove: true, cols: ['DST-ADDRESS', 'GATEWAY', 'DISTANCE'], fields: [F('dst-address', 'cidr', { def: '0.0.0.0/0' }), F('gateway', 'gw', { req: true }), F('distance', 'num', { def: '1' })] },
  {
    path: '/queue simple', key: 'name', add: true, remove: true, ordered: true, auto: 'queue', detail: true,
    // max-limit / limit-at are upload/download as seen from the target [9]
    fields: [F('name', 'str'), F('target', 'addr', { req: true }), F('limit-at', 'rate2', { def: '0/0' }), F('max-limit', 'rate2', { def: '0/0' })],
  },
  {
    path: '/ip hotspot', key: 'name', add: true, remove: true, auto: 'hotspot', cmds: ['setup'], cols: ['NAME', 'INTERFACE', 'ADDRESS-POOL', 'PROFILE', 'IDLE-TIMEOUT'],
    // idle-timeout 5m, profile default, addresses-per-mac 2 [11]
    fields: [F('name', 'str'), F('interface', 'iface', { req: true }), F('address-pool', 'ref', { ref: '/ip pool', extra: ['none'], def: 'none' }), F('profile', 'ref', { ref: '/ip hotspot profile', def: 'default' }),
      F('idle-timeout', 'time', { def: '5m' }), F('addresses-per-mac', 'num', { def: '2' })],
  },
  {
    path: '/ip hotspot profile', key: 'name', add: true, remove: true, auto: 'hsprof', cols: ['NAME', 'DNS-NAME', 'HOTSPOT-ADDRESS', 'LOGIN-BY'],
    fields: [F('name', 'str'), F('hotspot-address', 'ip', { def: '0.0.0.0' }), F('dns-name', 'str', { def: '' }), F('html-directory', 'str', { def: 'hotspot' }),
      F('login-by', 'multi', { values: ['cookie', 'http-chap', 'http-pap', 'https', 'mac', 'trial', 'mac-cookie'], def: 'http-chap,cookie' }), F('use-radius', 'enum', { values: yesno, def: 'no' })],
  },
  {
    path: '/ip hotspot user', key: 'name', add: true, remove: true, cols: ['SERVER', 'NAME', 'PROFILE'],
    fields: [F('name', 'str', { req: true }), F('password', 'str', { def: '', secret: true }), F('profile', 'ref', { ref: '/ip hotspot user profile', def: 'default' }),
      F('server', 'ref', { ref: '/ip hotspot', extra: ['all'], def: 'all' }), F('mac-address', 'mac', { def: '00:00:00:00:00:00' }), F('limit-uptime', 'time', { def: '0s' })],
  },
  {
    path: '/ip hotspot user profile', key: 'name', add: true, remove: true, auto: 'uprof', cols: ['NAME', 'SHARED-USERS', 'RATE-LIMIT'],
    // rate-limit rx/tx from the router's point of view: rx = client upload, tx = client download [11]
    fields: [F('name', 'str'), F('rate-limit', 'str', { def: '' }), F('shared-users', 'num', { def: '1' }), F('session-timeout', 'time', { def: '0s' })],
  },
  { path: '/ip hotspot active', view: true, remove: true, fields: [], cols: ['SERVER', 'USER', 'ADDRESS', 'MAC-ADDRESS', 'UPTIME'] },
  { path: '/ip hotspot walled-garden', add: true, remove: true, fields: [F('dst-host', 'str', { req: true }), F('action', 'enum', { values: ['allow', 'deny'], def: 'allow' }), F('server', 'str', { def: '' })], cols: ['ACTION', 'DST-HOST'] },
  { path: '/user', key: 'name', add: true, remove: true, cols: ['NAME', 'GROUP', 'LAST-LOGGED-IN'], fields: [F('name', 'str', { req: true }), F('group', 'enum', { values: ['full', 'write', 'read'], req: true }), F('password', 'str', { def: '', secret: true })] },
  { path: '/system identity', singleton: true, fields: [F('name', 'str', { def: 'MikroTik' })] },
  { path: '/file', view: true, key: 'name', remove: true, fields: [], cols: ['NAME', 'TYPE', 'SIZE'] },
];
export const TABLE = new Map(TABLES.map(t => [t.path, t]));
/** every menu path (tables plus menus that only hold sub-menus or commands) */
export const MENUS = new Set<string>(['/', '/ip', '/ip firewall', '/queue', '/system', '/system backup', '/system default-configuration', '/system resource', ...TABLES.map(t => t.path)]);
/** commands of menus that are not tables */
export const MENU_CMDS: Record<string, string[]> = {
  '/': ['ping', 'export'],
  '/system': ['reset-configuration', 'export'],
  '/system backup': ['save', 'load'],
  '/system default-configuration': ['print'],
  '/system resource': ['print'],
};

// ---------------------------------------------------------------- device
export interface Isp {
  /** how the ISP hands out the WAN address (⚠ design: the sim's ISP line, research does not model one) */
  mode: 'dhcp' | 'static';
  net: string; prefix: number; gw: string;
  /** the address the ISP gives (dhcp) or expects (static) */
  addr: string;
  dns: string[];
  /** plan speed in bps (⚠ design number) */
  down: number; up: number;
}
export const DEFAULT_ISP: Isp = { mode: 'dhcp', net: '10.20.0.0', prefix: 24, gw: '10.20.0.1', addr: '10.20.0.100', dns: ['8.8.8.8', '8.8.4.4'], down: 20_000_000, up: 20_000_000 };
export interface RosFile { name: string; type: 'backup' | 'script'; cfg?: RosConfig; password?: string; text?: string; size: number }
export interface HsActive { server: string; user: string; address: string; mac: string; since: number }
export interface RosConfig { tables: Record<string, Row[]>; nextId: number }
export interface RosDevice {
  id: string; model: ModelDef; serial: string; mac0: number[];
  cfg: RosConfig;
  files: Map<string, RosFile>;
  /** bumps on every change, so the netsim adapter can resync cheaply */
  rev: number;
  /** runtime state that is not configuration (not in a backup) */
  rt: { isp: Isp | null; wanPort: string; linked: Set<string>; active: HsActive[]; leases: DynLease[]; bootAt: number };
}
/** a lease handed out right now (filled by the netsim adapter from net.ts) */
export interface DynLease { address: string; mac: string; host: string; server: string }

const macOf = (d: RosDevice, n: number) => [...d.mac0.slice(0, 5), (d.mac0[5] + n) & 255].map(x => x.toString(16).padStart(2, '0').toUpperCase()).join(':');
export const etherNames = (m: ModelDef) => Array.from({ length: m.ethers }, (_, i) => `ether${i + 1}`);

/** a fresh table set with only the factory items (interfaces, admin user, default profiles) */
function baseConfig(d: RosDevice): RosConfig {
  const c: RosConfig = { tables: {}, nextId: 1 };
  for (const t of TABLES) if (!t.view) c.tables[t.path] = [];
  const add = (path: string, p: Record<string, string>, o: Partial<Row> = {}) => { const r: Row = { id: c.nextId++, disabled: false, dynamic: false, comment: '', p: withDefaults(path, p), ...o }; c.tables[path].push(r); return r; };
  etherNames(d.model).forEach((n, i) => add('/interface ethernet', { name: n, 'default-name': n, 'mac-address': macOf(d, i) }));
  // wireless interfaces are disabled until configured ([5] enables wlan1 before setting it)
  if (d.model.wlan) add('/interface wireless', { name: 'wlan1', 'default-name': 'wlan1', 'mac-address': macOf(d, d.model.ethers) }, { disabled: true });
  add('/interface wireless security-profiles', { name: 'default' });
  add('/ip hotspot profile', { name: 'default' });
  add('/ip hotspot user profile', { name: 'default' });
  // login: user admin with an empty password (or the sticker password on new units) [5]
  add('/user', { name: 'admin', group: 'full', password: '' });
  add('/system identity', { name: 'MikroTik' });
  add('/ip dns', {});
  return c;
}
export function withDefaults(path: string, p: Record<string, string>) {
  const t = TABLE.get(path)!; const o: Record<string, string> = {};
  for (const f of t.fields) if (f.def !== undefined) o[f.name] = f.def;
  return Object.assign(o, p);
}

/**
 * The "AP Router" default configuration [4]: ether1 = WAN (DHCP client, firewall), the other ports + wlan1 in the
 * LAN bridge with 192.168.88.1/24, DHCP server, DNS, NAT.
 * ⚠ inferred details (real defconf script not in the sources): bridge name "bridge", pool "default-dhcp"
 * 192.168.88.10-254, server "defconf", lease-time 30m (the [8] default); real defconf matches WAN/LAN with
 * interface lists, here the firewall uses the [5] rule set with in-interface=ether1. SSID "MikroTik-XXXXXX"
 * follows the [5] example (MikroTik-006360).
 */
export function applyDefconf(d: RosDevice) {
  const c = d.cfg;
  const add = (path: string, p: Record<string, string>, comment = 'defconf') => insertRow(d, path, p, { comment });
  add('/interface bridge', { name: 'bridge' });
  for (const n of etherNames(d.model).slice(1)) add('/interface bridge port', { bridge: 'bridge', interface: n });
  if (d.model.wlan) {
    const w = c.tables['/interface wireless'][0];
    Object.assign(w.p, { mode: 'ap-bridge', band: '2ghz-b/g/n', ssid: `MikroTik-${macOf(d, d.model.ethers).replace(/:/g, '').slice(-6)}` }); w.disabled = false;   // wlan1: ap-bridge, 2ghz-b/g/n, wpa2 no [4]
    add('/interface bridge port', { bridge: 'bridge', interface: 'wlan1' });
  }
  add('/ip address', { address: '192.168.88.1/24', interface: 'bridge', network: '192.168.88.0' });
  add('/ip pool', { name: 'default-dhcp', ranges: '192.168.88.10-192.168.88.254' }, '');
  add('/ip dhcp-server', { name: 'defconf', interface: 'bridge', 'address-pool': 'default-dhcp' }, '');
  add('/ip dhcp-server network', { address: '192.168.88.0/24', gateway: '192.168.88.1', 'dns-server': '192.168.88.1' });
  c.tables['/ip dns'][0].p['allow-remote-requests'] = 'yes';   // "DNS: enabled" [4]
  add('/ip dhcp-client', { interface: 'ether1' });
  add('/ip firewall nat', { chain: 'srcnat', action: 'masquerade', 'out-interface': 'ether1' }, 'defconf: masquerade');
  // [5] "IP Connectivity Access" + "Protecting the Clients" rule sets
  const fw: [Record<string, string>, string][] = [
    [{ chain: 'input', action: 'accept', 'connection-state': 'established,related,untracked' }, 'accept established,related,untracked'],
    [{ chain: 'input', action: 'drop', 'connection-state': 'invalid' }, 'drop invalid'],
    [{ chain: 'input', action: 'accept', 'in-interface': 'ether1', protocol: 'icmp' }, 'accept ICMP'],
    [{ chain: 'input', action: 'accept', 'in-interface': 'ether1', protocol: 'tcp', port: '8291' }, 'allow Winbox'],
    [{ chain: 'input', action: 'accept', 'in-interface': 'ether1', protocol: 'tcp', port: '22' }, 'allow SSH'],
    [{ chain: 'input', action: 'drop', 'in-interface': 'ether1' }, 'block everything else'],
    [{ chain: 'forward', action: 'fasttrack-connection', 'connection-state': 'established,related' }, 'fast-track for established,related'],
    [{ chain: 'forward', action: 'accept', 'connection-state': 'established,related' }, 'accept established,related'],
    [{ chain: 'forward', action: 'drop', 'connection-state': 'invalid' }, ''],
    [{ chain: 'forward', action: 'drop', 'connection-state': 'new', 'connection-nat-state': '!dstnat', 'in-interface': 'ether1' }, 'drop access to clients behind NAT from WAN'],
  ];
  for (const [p, cm] of fw) add('/ip firewall filter', p, cm ? `defconf: ${cm}` : 'defconf');
  d.rev++;
}

export function insertRow(d: RosDevice, path: string, p: Record<string, string>, o: Partial<Row> = {}, before?: number): Row {
  const r: Row = { id: d.cfg.nextId++, disabled: false, dynamic: false, comment: '', p: withDefaults(path, p), ...o };
  const list = d.cfg.tables[path];
  if (before !== undefined && before >= 0 && before < list.length) list.splice(before, 0, r); else list.push(r);
  d.rev++;
  return r;
}

let devSeq = 0;
export function createDevice(model: ModelId, opts: { id?: string; defconf?: boolean } = {}): RosDevice {
  const n = ++devSeq;
  const id = opts.id ?? `mt${n}`;
  const h = [...id].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 7);
  // MAC prefix 6C:3B:6B as in the [8] lease example (⚠ the real OUI per unit varies)
  const d: RosDevice = {
    id, model: MODELS[model], serial: `HE${(h % 0xffffff).toString(16).toUpperCase().padStart(6, '0')}`, mac0: [0x6c, 0x3b, 0x6b, (h >> 16) & 255, (h >> 8) & 255, h & 0xf0],
    cfg: { tables: {}, nextId: 1 }, files: new Map(), rev: 0,
    rt: { isp: null, wanPort: 'ether1', linked: new Set(), active: [], leases: [], bootAt: Date.now() },
  };
  d.cfg = baseConfig(d);
  if (opts.defconf !== false) applyDefconf(d);
  return d;
}

/** /system reset-configuration (no-defaults=yes keeps only factory items; otherwise defconf is applied again) [5] */
export function resetConfiguration(d: RosDevice, noDefaults: boolean, skipBackup: boolean) {
  // without skip-backup the router saves auto-before-reset.backup first (file name from the [10] load example)
  if (!skipBackup) saveBackup(d, 'auto-before-reset', '');
  d.cfg = baseConfig(d); d.rt.active = []; d.rt.bootAt = Date.now();   // the reset reboots the router
  if (!noDefaults) applyDefconf(d);
  d.rev++;
}

// ---------------------------------------------------------------- backup (binary .backup = full copy; .rsc = text)
export const cloneCfg = (c: RosConfig): RosConfig => JSON.parse(JSON.stringify(c));
export function saveBackup(d: RosDevice, name: string, password: string) {
  const fn = name.endsWith('.backup') ? name : `${name}.backup`;
  d.files.set(fn, { name: fn, type: 'backup', cfg: cloneCfg(d.cfg), password, size: 20000 + JSON.stringify(d.cfg).length });
  return fn;
}
export function findFile(d: RosDevice, name: string, type?: RosFile['type']) {
  return d.files.get(name) ?? (type === 'backup' ? d.files.get(`${name}.backup`) : type === 'script' ? d.files.get(`${name}.rsc`) : undefined) ?? null;
}
export function loadBackup(d: RosDevice, f: RosFile) { d.cfg = cloneCfg(f.cfg!); d.rt.active = []; d.rt.bootAt = Date.now(); d.rev++; }

// ---------------------------------------------------------------- lookups
export const rows = (d: RosDevice, path: string) => d.cfg.tables[path] ?? [];
export const single = (d: RosDevice, path: string) => rows(d, path)[0].p;
export const identity = (d: RosDevice) => single(d, '/system identity').name;
export type IfType = 'ether' | 'wlan' | 'bridge';
export interface IfRow { row: Row; type: IfType }
/** every interface (/interface view): ethernet, wireless, bridge */
export function interfaces(d: RosDevice): IfRow[] {
  return [
    ...rows(d, '/interface ethernet').map(row => ({ row, type: 'ether' as const })),
    ...rows(d, '/interface wireless').map(row => ({ row, type: 'wlan' as const })),
    ...rows(d, '/interface bridge').map(row => ({ row, type: 'bridge' as const })),
  ];
}
export const ifByName = (d: RosDevice, n: string) => interfaces(d).find(i => i.row.p.name === n) ?? null;
/** a physical port by its factory name (ether1, wlan1), whatever the user renamed it to */
export const ifByDefault = (d: RosDevice, n: string) => interfaces(d).find(i => (i.row.p['default-name'] ?? i.row.p.name) === n) ?? null;
/** the bridge a port is a member of (null = standalone) */
export function bridgeOf(d: RosDevice, ifName: string): string | null {
  const bp = rows(d, '/interface bridge port').find(r => !r.disabled && r.p.interface === ifName);
  return bp && ifByName(d, bp.p.bridge) ? bp.p.bridge : null;
}
/** the layer-3 interface a port's traffic lands on: its bridge, or itself */
export const l3Of = (d: RosDevice, ifName: string) => bridgeOf(d, ifName) ?? ifName;

// ---------------------------------------------------------------- values
export function parseRate(s: string): number | null {
  const m = /^(\d+(?:\.\d+)?)([kKMG]?)$/.exec(s.trim()); if (!m) return null;
  const mul = m[2] === 'k' || m[2] === 'K' ? 1e3 : m[2] === 'M' ? 1e6 : m[2] === 'G' ? 1e9 : 1;
  return Math.round(+m[1] * mul);
}
export const fmtRate = (n: number) => (n === 0 ? '0' : n % 1e9 === 0 ? `${n / 1e9}G` : n % 1e6 === 0 ? `${n / 1e6}M` : n % 1e3 === 0 ? `${n / 1e3}k` : `${n}`);
/** "a/b" or "a" (= a/a) → [first, second] in bps */
export function parseRate2(s: string): [number, number] | null {
  const parts = s.trim().split('/'); if (parts.length > 2 || !parts[0]) return null;
  const a = parseRate(parts[0]), b = parseRate(parts[1] ?? parts[0]);
  return a === null || b === null ? null : [a, b];
}
export function parseTime(s: string): number | null {
  const t = s.trim(); if (t === 'none') return 0;
  const hms = /^(\d+):(\d\d):(\d\d)$/.exec(t); if (hms) return +hms[1] * 3600 + +hms[2] * 60 + +hms[3];
  const re = /(\d+)(w|d|h|m|s)/g; let m: RegExpExecArray | null; let sum = 0; let used = '';
  while ((m = re.exec(t))) { sum += +m[1] * ({ w: 604800, d: 86400, h: 3600, m: 60, s: 1 } as Record<string, number>)[m[2]]; used += m[0]; }
  if (used !== t) return /^\d+$/.test(t) ? +t : null;
  return sum;
}
export function fmtTime(sec: number) {
  if (sec === 0) return '0s';
  const u: [string, number][] = [['w', 604800], ['d', 86400], ['h', 3600], ['m', 60], ['s', 1]]; let s = ''; let r = sec;
  for (const [k, v] of u) if (r >= v) { s += `${Math.floor(r / v)}${k}`; r %= v; }
  return s;
}
/** "192.168.88.1/24" → {ip, prefix}; a bare IP = /32 */
export function parseCidr(s: string): { ip: number; prefix: number } | null {
  const [a, b] = s.trim().split('/'); const ip = parseIp(a ?? ''); if (ip === null) return null;
  if (b === undefined) return { ip, prefix: 32 };
  if (!/^\d{1,2}$/.test(b) || +b > 32) return null;
  return { ip, prefix: +b };
}
export const cidrNet = (s: string) => { const c = parseCidr(s); return c ? ipStr(networkOf(c.ip, c.prefix)) : ''; };
/** does an address match "1.2.3.4", "1.2.3.0/24" or "1.2.3.10-1.2.3.20"? */
export function addrMatch(spec: string, ip: string): boolean {
  const x = parseIp(ip); if (x === null) return false;
  return spec.split(',').some(part => {
    const r = /^(\S+)-(\S+)$/.exec(part);
    if (r) { const a = parseIp(r[1]), b = parseIp(r[2]); return a !== null && b !== null && x >= a && x <= b; }
    const c = parseCidr(part); return !!c && networkOf(x, c.prefix) === networkOf(c.ip, c.prefix);
  });
}
/** "a-b,c-d" pool ranges → list of [start, end] */
export function parseRanges(s: string): [number, number][] | null {
  const out: [number, number][] = [];
  for (const part of s.split(',')) {
    const r = /^([\d.]+)(?:-([\d.]+))?$/.exec(part.trim()); if (!r) { const c = parseCidr(part); if (!c) return null; const n = networkOf(c.ip, c.prefix); out.push([n, broadcastOf(c.ip, c.prefix)]); continue; }
    const a = parseIp(r[1]), b = parseIp(r[2] ?? r[1]); if (a === null || b === null || b < a) return null; out.push([a, b]);
  }
  return out.length ? out : null;
}
export const isMac = (s: string) => /^([0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}$/.test(s);
export { ipStr, parseIp, networkOf, broadcastOf };

/** the MAC of an interface as Winbox/ARP see it; a bridge (auto-mac) takes the MAC of its first port ⚠ (admin-mac not simulated) */
export function ifMac(d: RosDevice, name: string): string {
  const own = interfaces(d).find(i => i.row.p.name === name)?.row.p['mac-address'];
  if (own) return own;
  const first = rows(d, '/interface bridge port').find(r => r.p.bridge === name)?.p.interface;
  return first && first !== name ? ifMac(d, first) : '';
}
