import Unreliable, { UnreliablePacket } from "./UnreliablePacket";
import PolusBuffer from "../util/PolusBuffer";
import { ParsedPacket } from "./Packet";
import Room from "../util/Room";

export interface ReliablePacket {
	Nonce: number,
	Data: UnreliablePacket
}

class Reliable {
	constructor(private room: Room, private toServer: boolean) {}
	UnreliablePacketHandler = new Unreliable(this.room, this.toServer)
	parse(packet: PolusBuffer): ReliablePacket {
		return {
			Nonce: packet.readU16(true),
			Data: this.UnreliablePacketHandler.parse(packet)
		};
	}
	serialize(packet: ParsedPacket): PolusBuffer {
		var buf = new PolusBuffer();
		buf.writeU16(packet.Nonce, true);
		//@ts-ignore
		buf.writeBytes(this.UnreliablePacketHandler.serialize(packet.Data))
		return buf;
	}
}

export default Reliable;