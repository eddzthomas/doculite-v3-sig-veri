import { createServer } from 'node:http'

// Capture-side webhook receiver: records raw deliveries (headers + body)
// for the recording file. Notification-only — payload content is never
// trusted without an authoritative API read (AGENTS.md invariant).
export function startHookReceiver({ port = 8300 }) {
  const deliveries = []
  const server = createServer((req, res) => {
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => {
      deliveries.push({
        receivedAt: new Date().toISOString(),
        method: req.method,
        path: req.url,
        headers: req.headers,
        body: Buffer.concat(chunks).toString('utf8'),
      })
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end('{"received":true}')
    })
  })
  return new Promise((resolve, reject) => {
    // Listen errors (e.g. EADDRINUSE) must settle the promise; without this
    // the promise never resolves or rejects.
    server.on('error', reject)
    server.listen(port, '127.0.0.1', () =>
      resolve({
        url: `http://127.0.0.1:${port}/hook`,
        deliveries,
        close: () =>
          new Promise((r) => {
            // Keep-alive sockets would otherwise keep close() pending forever.
            server.closeAllConnections()
            server.close(r)
          }),
      }),
    )
  })
}
