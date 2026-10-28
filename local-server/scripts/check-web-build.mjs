import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const webDir = resolve('dist/web')
const html = readFileSync(resolve(webDir, 'index.html'), 'utf8')
const stylesheet = html.match(/href="(\/assets\/[^"?]+\.css)"/)?.[1]

if (!stylesheet) {
  throw new Error('The hall web build does not reference a generated stylesheet.')
}

const css = readFileSync(resolve(webDir, stylesheet.replace(/^\//, '')), 'utf8')
const requiredSelectors = ['.btn-primary{', '.card{', '.input{', '.min-h-screen{', '.bg-background{']
const missing = requiredSelectors.filter((selector) => !css.includes(selector))

if (missing.length > 0) {
  throw new Error(
    `The hall stylesheet is missing required selectors: ${missing.join(', ')}. ` +
      'Check that Tailwind scans local-server/web/src.',
  )
}

console.log(`Verified hall stylesheet ${stylesheet} (${css.length} bytes).`)
