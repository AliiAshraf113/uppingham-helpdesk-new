/* eslint-disable @typescript-eslint/no-require-imports -- Passenger loads server.js as CommonJS. */
const { createServer } = require("node:http");
const next = require("next");

const port = Number.parseInt(process.env.PORT || "3000", 10);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be a valid TCP port number.");
}

const app = next({ dev: false, port, webpack: true });
const handle = app.getRequestHandler();

app.prepare()
  .then(() => {
    const server = createServer((request, response) => handle(request, response));
    server.listen(port, () => {
      console.log(`Helpdesk server started on port ${port}.`);
    });
  })
  .catch((error) => {
    console.error("Helpdesk server failed to start.", error);
    process.exitCode = 1;
  });
