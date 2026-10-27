import { networkInterfaces, type NetworkInterfaceInfo } from 'node:os';

/**
 * Les adresses IPv4 privées de la machine, la plus probable d'abord :
 * celle d'une box (192.168.x.x), puis 10.x.x.x, puis 172.16–31.x.x —
 * cette dernière plage est aussi celle des réseaux Docker, qu'on ne
 * veut pas voir dans un QR code.
 */
export function privateIPv4Addresses(
  interfaces: NodeJS.Dict<NetworkInterfaceInfo[]> = networkInterfaces(),
): string[] {
  const rang = (ip: string): number => {
    if (ip.startsWith('192.168.')) return 0;
    if (ip.startsWith('10.')) return 1;
    return 2;
  };

  return Object.entries(interfaces)
    .filter(([name]) => !/^(docker|br-|veth|virbr)/.test(name))
    .flatMap(([, infos]) => infos ?? [])
    .filter((info) => info.family === 'IPv4' && !info.internal)
    .map((info) => info.address)
    .filter((ip) => /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip))
    .sort((a, b) => rang(a) - rang(b));
}
