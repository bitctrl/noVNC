export const NativeWebSocket = globalThis.WebSocket;

const startTime = Date.now();
const textEncoder = new TextEncoder();
let UI;

function readablizeBytes(bytes) {
    const s = ['b', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB'];
    let y = bytes, i = 0, l = s.length;
    while (i < l && y > 512) {
        y = y / 1024;
        ++i;
    }
    y = Math.round(y * 100);
    if (y < 100) {
        y = '0.' + y;
    } else {
        y = '' + y;
        y = y.slice(0, -2) + '.' + y.slice(-2);
    }
    return y + ' ' + s[i];
}

function computeProtocolOverhead(bytes) {
    let overhead = bytes <= 125 ? 6 : bytes <= 0x7fff ? 8 : 14;
    let packets = 0;
    bytes += overhead;
    while (bytes > 0) {
        ++packets;
        overhead += 20 + 20;
        bytes -= 1500;
    }
    return { packets, overhead };
}

let timer = null;

export class TrafficStatWebSocket extends WebSocket {
    static get UI() { return UI; }
    static set UI(ui) {
        UI = ui;
    }
    constructor(url, protocols) {
        const ws = new NativeWebSocket(url, protocols);
        ws.messgagesRcvd = 0;
        ws.messgagesSent = 0;
        ws.packetsRcvd = 0;
        ws.packetsSent = 0;
        ws.bytesRcvd = 0;
        ws.bytesSent = 0;
        ws.metaBytesRcvd = 0;
        ws.metaBytesSent = 0;
        ws.addEventListener('message', (event) => {
            const data = event.data;
            const bytes = typeof data === 'string' ? textEncoder.encode( data ).length : data.byteLength;
            ++ws.messgagesRcvd;
            ws.bytesRcvd += bytes;
            const { packets, overhead } = computeProtocolOverhead(bytes);
            ws.metaBytesRcvd += overhead;
            ws.packetsRcvd += packets;
        });
        const send = ws.send;
        ws.send = (data) => {
            const bytes = typeof data === 'string' ? textEncoder.encode( data ).length : data.byteLength;
            ++ws.messgagesSent;
            ws.bytesSent += bytes;
            ws.metaBytesSent += bytes <= 125 ? 6 : bytes <= 0x7fff ? 8 : 14;
            const { packets, overhead } = computeProtocolOverhead(bytes);
            ws.metaBytesSent += overhead;
            ws.packetsSent += packets;
            send.call(ws, data);
        };
        setTimeout(() => {
            if (timer) { return; }

            UI.rfb.addEventListener("disconnect", () => {
                clearTimeout(timer);
                clearInterval(timer);
                timer = null;
            });

            timer = setTimeout(() => {
                timer = setInterval(() => {
                    if (!(UI.connected)) {
                        clearInterval(timer);
                        return;
                    }
                    const bytes = ws.bytesSent + ws.bytesRcvd;
                    const metaBytes = ws.metaBytesSent + ws.metaBytesRcvd;
                    const messages = ws.messgagesSent + ws.messgagesRcvd;
                    const packets = ws.packetsSent + ws.packetsRcvd;
                    const now = Date.now();
                    const uptime = now - startTime;
                    const uptimeHours = uptime / 3600_000;
                    const uptimeDays = uptime / 86400_000;
                    const uptimeString = parseInt(uptimeDays) + 'd' + new Date(uptime).toISOString().slice(11, 19);
                    UI.showStatus([
                        uptimeString,
                        readablizeBytes(bytes) + ' + ' + readablizeBytes(metaBytes),
                        readablizeBytes(bytes / uptimeHours).padStart(16) + '/h' + ' + ' + readablizeBytes(metaBytes / uptimeHours).padStart(16) + '/h',
                        Math.round(messages / uptimeHours) + ' msg/h',
                        Math.round(packets / uptimeHours) + ' pph',
                        readablizeBytes(ws.bytesSent / messages) + '/msg',
                        (ws.packetsSent / messages).toFixed(1) + ' p/msg',
                        readablizeBytes(ws.bytesRcvd / messages) + '/msg',
                        (ws.packetsRcvd / messages).toFixed(1) + ' p/msg',
                    ].join(' | '), null, 2500);
                }, 2000);
            }, 2000);
        });
        return ws;
    }
}
