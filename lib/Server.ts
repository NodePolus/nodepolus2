const publicIp = require('public-ip');

import { Socket, createSocket, RemoteInfo } from 'dgram'

import { Room } from './util/Room'
import Connection from './util/Connection'
import { Packet as Subpacket } from './packets/UnreliablePacket'
import { addr2str } from './util/misc'
import { RoomListing } from './packets/Subpackets/GameSearchResults'
import ConnectionEvent from './events/ConnectionEvent';
import AsyncEventEmitter from './util/AsyncEventEmitter';
import RoomCreationEvent from './events/RoomCreationEvent';
import JoinRoomRequestEvent from './events/JoinRoomRequestEvent';
import DisconnectReason, { DisconnectReasons } from './packets/PacketElements/DisconnectReason';
import RoomListingRequestEvent from './events/RoomListingRequestEvent';

export interface ServerConfig {
  accessibleIP?: string,
  accessiblePort?: number
}

class Server extends AsyncEventEmitter {
	port: number;
	sock: Socket;
	rooms: Map<string, Room> = new Map();
	connections: Map<string, Connection>;
	private clientIDIncrementer = 256;
	constructor(public config:ServerConfig = {}) {
		super();
    this.connections = new Map();
	}
	public listen(port: number = 22023) {
	  if (!this.config.accessibleIP) {
      let gthis = this;
      publicIp.v4().then((result:string) => {
        gthis.config.accessibleIP = result;
      }).catch((err:Error) => {
        throw err;
      })
	  }
	  if (!this.config.accessiblePort) {
	  	this.config.accessiblePort = port
	  }
	  this.port = port;
    this.sock = createSocket("udp4");
	  this.sock.on("listening", () => this.emit("listening", this.port));
	  this.sock.on("message", async (msg, remote) => {
		const connection = await this.getConnection(remote);
		if(connection) {
			await connection.emit("message", msg);
		}
	  });
	  this.sock.bind(this.port);
	}
	public close(reason:string|number = 19) {
	  return new Promise((resolve) => {
      [...this.rooms.values()].forEach((room:Room) => {
        room.close(reason)
      })
      this.connections = new Map();
		  this.sock.close(resolve);
	  })
	}
  private async handlePacket(packet: Subpacket, connection: Connection){
		let room:Room;
		switch(packet.type) {
			case 'GameCreate':
				room = new Room(this);
				room.settings = packet.RoomSettings;
				let roomEvent = new RoomCreationEvent(room)
				await this.emit("roomCreated", roomEvent);
				if(roomEvent.isCanceled) {
					room.close()
					connection.disconnect(roomEvent.cancelReason)
					return
				}
				this.rooms.set(room.code, room);
				connection.send({
					type: 'SetGameCode',
					RoomCode: room.code
				});
				room.on('close', () => {
					this.rooms.delete(room.code);
				})
			break;
			case 'JoinGame':
				let joinRoomRequestEvent = new JoinRoomRequestEvent(packet.RoomCode, connection);
				await this.emit("joinRoomRequest", joinRoomRequestEvent)
				await connection.emit("joinRoomRequest", joinRoomRequestEvent)
				if(joinRoomRequestEvent.isCanceled) {
					connection.disconnect();
					let room = this.rooms.get(packet.RoomCode)
					if(room && room.connections.length == 0) {
						room.close()
					}
				}
				room = this.rooms.get(packet.RoomCode);

				if (room) {
					connection.moveRoom(room);
				} else {
					connection.disconnect(new DisconnectReason(DisconnectReasons.GameNotFound));
				}

				break;
			case 'GameSearch':
			  let rooms = [...this.rooms.values()];
			  let MapCounts:number[] = [0,0,0];
			  let RoomList:RoomListing[] = [];
			  for (var i = 0; i < rooms.length; i++) {
				let room = rooms[i]
				MapCounts[room.settings.Map]++;
				if (packet.RoomSettings.Language != 0 && room.settings.Language != packet.RoomSettings.Language) break
				if (packet.RoomSettings.ImpostorCount != 0 && room.settings.ImpostorCount != packet.RoomSettings.ImpostorCount) break
				if ((packet.RoomSettings.Map & (2 ** room.settings.Map)) === 0) break

				RoomList.push({
				  IP: this.config.accessibleIP,
				  Port: this.config.accessiblePort,
				  RoomCode: room.code,
				  RoomName: room.host.player.name,
				  PlayerCount: room.connections.length,
				  Age: 0n,
				  MapID: room.settings.Map,
				  ImpostorCount: room.settings.ImpostorCount,
				  MaxPlayers: room.settings.MaxPlayers
				})
        }
        let roomListingRequestEvent = new RoomListingRequestEvent({
          includePrivate: packet.IncludePrivate,
          filter: packet.RoomSettings
        }, {
          SkeldRoomCount: MapCounts[0],
          MiraHQRoomCount: MapCounts[1],
          PolusRoomCount: MapCounts[2],
          Rooms: RoomList
        })
        if(roomListingRequestEvent.isCanceled) {
          delete roomListingRequestEvent.response.SkeldRoomCount
          delete roomListingRequestEvent.response.MiraHQRoomCount
          delete roomListingRequestEvent.response.PolusRoomCount
          roomListingRequestEvent.response.Rooms = [];
        }
        connection.send({
          type: "GameSearchResults",
          SkeldGameCount: roomListingRequestEvent.response.SkeldRoomCount,
          MiraHQGameCount: roomListingRequestEvent.response.MiraHQRoomCount,
          PolusGameCount: roomListingRequestEvent.response.PolusRoomCount,
          RoomList: roomListingRequestEvent.response.Rooms
        })
			default:
			  connection.player.room.handlePacket(packet, connection);
			  break;
		}
	}

	private async getConnection (remote: RemoteInfo): Promise<Connection|undefined> {
		let connection = this.connections.get(addr2str(remote));
		if (!connection) {
			connection = this.buildConnection(remote);
			let conEvt = new ConnectionEvent(connection)
			await this.emit("connection", conEvt)
			if(conEvt.isCanceled) {
				connection.disconnect(conEvt.cancelReason)
			} else {
				return connection
			}
		} else {
			return connection
		}
  	}
  
	private buildConnection(remote:RemoteInfo): Connection {
		let conn = new Connection(remote, this.sock, true, this.requestClientID())
    this.connections.set(addr2str(remote), conn);
		conn.on("packet", (packet: Subpacket) => {
			this.handlePacket(packet, conn)
		});
		conn.on("close", () => {
      this.connections.delete(addr2str(remote));
		})
		return conn
	}
	private requestClientID() {
    return this.clientIDIncrementer++;
	}
}

export default Server
