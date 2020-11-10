import RoomCode from '../PacketElements/RoomCode'
import PolusBuffer from '../../util/PolusBuffer'
import { SubpacketClass } from './subpacket';

export interface JoinGamePacket {
  type: 'JoinGame',
	RoomCode: string,
	MapOwnership: number
}

export const JoinGame: SubpacketClass<JoinGamePacket> = {
	parse(packet: PolusBuffer): JoinGamePacket {
		return {
      type: 'JoinGame',
			RoomCode: RoomCode.intToString(packet.read32()),
			MapOwnership: packet.readU8()
		};
  },

	serialize(packet: JoinGamePacket): PolusBuffer {
		const buf = new PolusBuffer(5);
		buf.write32(RoomCode.stringToInt(packet.RoomCode));
		buf.writeU8(packet.MapOwnership);
		return buf;
	}
}
