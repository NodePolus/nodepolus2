import { Socket, createSocket, RemoteInfo } from "dgram";
import { EventEmitter } from "events";
import Room from "./util/Room.js";
import Connection from "./util/Connection.js";

import { SubPacket } from './packets/Subpackets/subpacket'
import { addr2str } from "./util/misc.js";

class Server extends EventEmitter {
    port: number;
    sock: Socket;
    rooms: Map<string, Room> = new Map();
    clientConnectionMap: Map<string, Connection>;
    private clientIDIncrementer = 256;
    constructor(port:number = 22023) {
        super();
        this.clientConnectionMap = new Map();
        this.port = port;
        this.sock = createSocket("udp4");
        this.sock.on("listening", () => this.emit("listening", this.port));
        this.sock.on("message", (msg, remote) => {
          const connection = this.getConnection(remote);
          connection.emit("message", msg);
        });
        this.sock.bind(this.port);
    }
    private handlePacket(packet: SubPacket, connection: Connection){
        switch(packet.type) {
            case 'GameCreate': {
                let room = new Room(this);
                room.settings = packet.RoomSettings;
                this.emit("roomCreated", room);
                this.rooms.set(room.code, room);
                connection.send({
                  type: 'SetGameCode',
                  RoomCode: room.code
                });
                break;
            }
            case 'JoinGame': {
              const room = this.rooms.get(packet.RoomCode);

              if (room) {
                connection.moveRoom(room);
              } else {
                connection.disconnect();
              }

              break;
            }
            default: {
              connection.player?.room?.handlePacket(packet, connection);
            }
        }
    }

    private getConnection (remote: RemoteInfo): Connection {
      let connection = this.clientConnectionMap.get(addr2str(remote));
      if (!connection) connection = this.buildConnection(remote);
      return connection
    }

    private buildConnection(remote:RemoteInfo): Connection {
        let conn = new Connection(remote, this.sock, true, this.requestClientID())
        this.clientConnectionMap.set(addr2str(remote), conn);
        conn.on("packet", (packet: SubPacket) => {
            this.handlePacket(packet, conn)
        });
        conn.on("closed", () => {
            this.clientConnectionMap.delete(addr2str(remote));
        })
        return conn
    }
    private requestClientID() {
        let i = this.clientIDIncrementer;
        this.clientIDIncrementer++;
        return i;
    }
}

export default Server;