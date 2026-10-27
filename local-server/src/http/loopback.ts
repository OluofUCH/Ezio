import type { NextFunction, Request, Response } from 'express'

/**
 * Setup and admin pages control pairing, key rotation, push and backups. They are
 * intentionally reachable only from the hall PC itself, even though the student
 * exam is served to the LAN on the same port.
 */
export function isLoopback(req: Request): boolean {
  const address = req.socket.remoteAddress
  if (!address) return false

  return (
    address === '127.0.0.1' ||
    address === '::1' ||
    address === '::ffff:127.0.0.1'
  )
}

export function requireLoopback(req: Request, res: Response, next: NextFunction): void {
  if (!isLoopback(req)) {
    res.status(403).json({
      ok: false,
      error: {
        code: 'FORBIDDEN',
        message: 'This page is available only on the exam-hall computer itself.',
      },
    })
    return
  }

  next()
}
