import { http, HttpResponse, ws } from 'msw';
import { COMMANDS_URL, DEVICE_ID, REST_BASE_URL, STREAM_URL, snapshot } from './contract.js';

/**
 * MSW WebSocket link & REST handlers — WHATWG-shaped mock of the Unit 10 Bitcoin stream.
 * Docs: https://mswjs.io/docs/websocket/
 *
 * Lesson — Unit 10, Flagship sandbox — Streamfield:
 * https://ruvebal.github.io/web-atelier-udit/lessons/en/feii/unit-10-iot-python-backend/#flagship-sandbox--streamfield
 */
const device = ws.link(STREAM_URL);

export const handlers = [
  device.addEventListener('connection', ({ client }) => {
    let sequence = 0;

    const push = () => {
      client.send(JSON.stringify(snapshot(sequence)));
      sequence += 1;
    };

    push();
    const timer = setInterval(push, 1000);

    client.addEventListener('close', () => {
      clearInterval(timer);
    });
  }),

  // REST One-shot frame endpoint (GET /v1/devices/lab-01)
  http.get(REST_BASE_URL, () => {
    return HttpResponse.json(snapshot(0));
  }),

  // REST Device / Alert Command endpoint (POST /v1/devices/lab-01/commands)
  http.post(COMMANDS_URL, async ({ request }) => {
    let body = {};
    try {
      body = await request.json();
    } catch {
      body = {};
    }
    return HttpResponse.json({
      deviceId: DEVICE_ID,
      accepted: true,
      source: 'msw-mock',
      command: body.command ?? 'move',
      target: body.target ?? null,
      receivedAt: Date.now(),
    });
  }),
];
