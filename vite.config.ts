import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import path from 'path'
import fs from 'fs'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    base: './',
    server: {
      host: true, // Listen on all network addresses (0.0.0.0) including LAN/Wi-Fi
      port: 5173,
    },
    plugins: [
      react(),
      {
        name: 'textbee-sms-proxy-server',
        configureServer(server) {
          // In-memory registry of active LAN peers for zero-internet signaling
          const lanClients = new Map<string, Set<any>>()

          // 1. LAN Signaling SSE Stream
          server.middlewares.use('/api/lan-signaling/stream', (req, res) => {
            const parsedUrl = new URL(req.url || '', 'http://localhost')
            const userId = parsedUrl.searchParams.get('userId')

            if (!userId) {
              res.statusCode = 400
              res.end('Missing userId parameter')
              return
            }

            res.writeHead(200, {
              'Content-Type': 'text/event-stream',
              'Cache-Control': 'no-cache, no-transform',
              Connection: 'keep-alive',
              'Access-Control-Allow-Origin': '*',
            })

            if (!lanClients.has(userId)) {
              lanClients.set(userId, new Set())
            }
            lanClients.get(userId)!.add(res)

            res.write(`data: ${JSON.stringify({ type: 'connected', userId })}\n\n`)

            const keepAliveTimer = setInterval(() => {
              try {
                res.write(':keepalive\n\n')
              } catch {}
            }, 15000)

            req.on('close', () => {
              clearInterval(keepAliveTimer)
              const userSet = lanClients.get(userId)
              if (userSet) {
                userSet.delete(res)
                if (userSet.size === 0) {
                  lanClients.delete(userId)
                }
              }
            })
          })

          // 2. LAN Signaling Event Dispatcher
          server.middlewares.use('/api/lan-signaling/send', async (req, res) => {
            if (req.method !== 'POST') {
              res.statusCode = 405
              res.end('Method not allowed')
              return
            }

            let bodyStr = ''
            req.on('data', (chunk) => {
              bodyStr += chunk
            })

            req.on('end', () => {
              try {
                const signal = JSON.parse(bodyStr || '{}')
                const targetId = signal.targetId
                const senderId = signal.senderId
                let deliveredCount = 0

                const ssePayload = `data: ${JSON.stringify(signal)}\n\n`

                if (signal.payload?.isGroup || targetId === '*') {
                  // Broadcast to all active peers on LAN except sender
                  for (const [peerId, clientSet] of lanClients.entries()) {
                    if (peerId !== senderId) {
                      for (const clientRes of clientSet) {
                        try {
                          clientRes.write(ssePayload)
                          deliveredCount++
                        } catch {}
                      }
                    }
                  }
                } else if (targetId && lanClients.has(targetId) && lanClients.get(targetId)!.size > 0) {
                  // Direct dispatch to targeted peer
                  const clientSet = lanClients.get(targetId)!
                  for (const clientRes of clientSet) {
                    try {
                      clientRes.write(ssePayload)
                      deliveredCount++
                    } catch {}
                  }
                } else {
                  // Robust LAN fallback: broadcast to all active LAN peers (except sender) so no signal is ever lost
                  for (const [peerId, clientSet] of lanClients.entries()) {
                    if (peerId !== senderId) {
                      for (const clientRes of clientSet) {
                        try {
                          clientRes.write(ssePayload)
                          deliveredCount++
                        } catch {}
                      }
                    }
                  }
                }

                res.writeHead(200, {
                  'Content-Type': 'application/json',
                  'Access-Control-Allow-Origin': '*',
                })
                res.end(JSON.stringify({ ok: true, deliveredCount }))
              } catch (err: any) {
                res.statusCode = 400
                res.end(JSON.stringify({ error: err.message }))
              }
            })
          })

          // 3. Active LAN Peers Discovery
          server.middlewares.use('/api/lan-signaling/peers', (_req, res) => {
            const peers = Array.from(lanClients.keys())
            res.writeHead(200, {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
            })
            res.end(JSON.stringify({ peers, count: peers.length }))
          })

          // 4. Standalone Binary Downloads (serves directly from project root, preventing dist asset bloat)
          server.middlewares.use('/downloads', (req, res, next) => {
            const parsedUrl = new URL(req.url || '', 'http://localhost')
            const filename = path.basename(parsedUrl.pathname)
            const targetFile = path.join(process.cwd(), filename)
            if (fs.existsSync(targetFile)) {
              const stat = fs.statSync(targetFile)
              res.writeHead(200, {
                'Content-Length': stat.size,
                'Content-Type': filename.endsWith('.apk') ? 'application/vnd.android.package-archive' : 'application/octet-stream',
                'Content-Disposition': `attachment; filename="${filename}"`,
                'Access-Control-Allow-Origin': '*',
              })
              fs.createReadStream(targetFile).pipe(res)
              return
            }
            next()
          })

          // 5. TextBee SMS Gateway
          server.middlewares.use('/api/send-sms', async (req, res) => {
            if (req.method !== 'POST') {
              res.statusCode = 405
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ error: 'Method not allowed' }))
              return
            }

            let bodyStr = ''
            req.on('data', (chunk) => {
              bodyStr += chunk
            })

            req.on('end', async () => {
              try {
                const body = JSON.parse(bodyStr || '{}')
                const apiKey = env.VITE_TEXTBEE_API_KEY || body.apiKey

                if (!apiKey || apiKey.includes('placeholder')) {
                  res.statusCode = 400
                  res.setHeader('Content-Type', 'application/json')
                  res.end(
                    JSON.stringify({
                      error: 'TextBee API Key missing. Please set VITE_TEXTBEE_API_KEY in .env',
                    })
                  )
                  return
                }

                const deviceId = env.VITE_TEXTBEE_DEVICE_ID || body.deviceId

                const textbeeResponse = await fetch('https://api.textbee.dev/api/v1/gateway/send-sms', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': apiKey,
                  },
                  body: JSON.stringify({
                    recipients: body.recipients,
                    message: body.message,
                    ...(deviceId ? { deviceId } : {}),
                  }),
                })

                const data = await textbeeResponse.json().catch(() => ({}))
                res.statusCode = textbeeResponse.status
                res.setHeader('Content-Type', 'application/json')
                res.end(JSON.stringify(data))
              } catch (err: any) {
                console.error('[TextBee Proxy Error]:', err)
                res.statusCode = 500
                res.setHeader('Content-Type', 'application/json')
                res.end(JSON.stringify({ error: err.message || 'SMS dispatch failed' }))
              }
            })
          })
        },
      },
    ],
  }
})
