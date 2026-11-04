import sharp from 'sharp'
import { badRequest, payloadTooLarge, unsupportedMediaType } from '@/lib/errors'
import { SCHOOL_LOGO_MAX_BYTES } from '@/lib/validation/school-logo'

const MAX_STORED_BYTES = 128 * 1024

/**
 * Store a small, re-encoded image in School.logoUrl. A data URL uses the existing
 * durable school record and works across deployments without local file storage.
 */
export async function normalizeSchoolLogo(input: Buffer): Promise<string> {
  if (input.length === 0) throw badRequest('The uploaded logo is empty.')
  if (input.length > SCHOOL_LOGO_MAX_BYTES) throw payloadTooLarge('Choose a school logo smaller than 2 MB.')

  const image = sharp(input, { limitInputPixels: 12_000_000, failOn: 'error' })
  const metadata = await image.metadata().catch(() => null)
  if (!metadata) throw badRequest('This image could not be read. Choose a valid PNG, JPEG or WebP logo.')
  if (!['png', 'jpeg', 'webp'].includes(metadata.format ?? '')) {
    throw unsupportedMediaType('Use a PNG, JPEG or WebP logo.')
  }
  if ((metadata.pages ?? 1) > 1) throw badRequest('Choose a still image for your school logo.')

  let data: Buffer
  try {
    // Preserve transparency and aspect ratio, apply orientation, and strip metadata.
    data = await image.rotate().resize(512, 512, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 90 }).toBuffer()
    if (data.length > MAX_STORED_BYTES) {
      data = await sharp(data).resize(256, 256, { fit: 'inside' }).webp({ quality: 85 }).toBuffer()
    }
  } catch {
    throw badRequest('This image could not be read. Choose a valid PNG, JPEG or WebP logo.')
  }
  if (data.length > MAX_STORED_BYTES) throw payloadTooLarge('The resized logo is too large. Choose a smaller image.')

  return `data:image/webp;base64,${data.toString('base64')}`
}
