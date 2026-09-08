#!/usr/bin/env node
/**
 * Ad-hoc code signing for the macOS build.
 *
 * Without a Developer ID electron-builder skips signing altogether, so the app
 * ships with whatever the linker left on the Electron binary: Identifier is
 * literally "Electron", the flags say `adhoc,linker-signed`, and neither the
 * hardened runtime nor the entitlements from electron-builder.yml are applied.
 * TCC cannot derive a stable code requirement from a linker-signed bundle, so
 * it re-asks for file access (Documents, external disks, network volumes) on
 * every launch — and the record is shared with every other unsigned Electron
 * app on the machine, which invalidates it further.
 *
 * A real codesign pass with the ad-hoc identity ("-") fixes the identity: the
 * bundle gets its own code directory with Identifier=com.leditor.app, the
 * hardened runtime and the entitlements. TCC remembers the grant for that
 * build. The cdhash still changes with every build, so each new version asks
 * once; only a Developer ID signature makes the grant survive updates.
 *
 * Runs as an electron-builder `afterPack` hook, and can be run by hand against
 * a built bundle:
 *
 *   node scripts/adhoc-sign-mac.mjs "dist/mac-universal/Leditor.app"
 */

import { execFileSync } from 'node:child_process'
import { closeSync, openSync, readdirSync, readFileSync, readSync, statSync } from 'node:fs'
import { join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const ENTITLEMENTS = fileURLToPath(new URL('../resources/entitlements.mac.plist', import.meta.url))

// Mach-O and universal-binary magic, both byte orders.
const MACHO_MAGIC = new Set([0xfeedface, 0xfeedfacf, 0xcefaedfe, 0xcffaedfe, 0xcafebabe, 0xbebafeca])

/** True for Mach-O executables, dylibs and .node addons — everything codesign has to touch. */
function isMachO(filePath) {
  let fd
  try {
    fd = openSync(filePath, 'r')
    const head = Buffer.alloc(4)
    if (readSync(fd, head, 0, 4, 0) < 4) return false
    return MACHO_MAGIC.has(head.readUInt32BE(0))
  } catch {
    return false
  } finally {
    if (fd !== undefined) closeSync(fd)
  }
}

/**
 * A versioned framework is signed through Versions/A, not through the wrapper
 * directory: the wrapper is a tangle of symlinks into that version.
 */
function bundleTarget(dir) {
  if (!dir.endsWith('.framework')) return dir
  const versioned = join(dir, 'Versions', 'A')
  try {
    return statSync(versioned).isDirectory() ? versioned : dir
  } catch {
    return dir
  }
}

/**
 * True for the directory that holds a bundle's main executable: Contents/MacOS
 * of an app, or Versions/<V> of a framework. Handing codesign a bundle's main
 * binary makes it sign the whole bundle, which fails while the bundle's own
 * subcomponents are still unsigned ("code object is not signed at all").
 * Those binaries are covered when the bundle itself is signed.
 */
function holdsBundleMainBinary(parentDir, name) {
  if (name === 'MacOS' && parentDir.endsWith(`${sep}Contents`)) return true
  return parentDir.endsWith(`.framework${sep}Versions`)
}

/**
 * Signing targets in inside-out order: nested code must be signed before the
 * bundle that contains it, or the outer signature seals a stale hash.
 */
function collectTargets(dir, out = [], skipMachOFiles = false) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    // Symlinks point at something already in the list (Versions/Current, the
    // framework wrapper's shortcuts) — signing them twice corrupts the bundle.
    if (entry.isSymbolicLink()) continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      collectTargets(full, out, holdsBundleMainBinary(dir, entry.name))
      if (entry.name.endsWith('.app') || entry.name.endsWith('.framework')) {
        out.push(bundleTarget(full))
      }
    } else if (!skipMachOFiles && entry.isFile() && isMachO(full)) {
      out.push(full)
    }
  }
  return out
}

/**
 * Entitlements go on things that run: the app bundles and standalone
 * executables (chrome_crashpad_handler, ShipIt). Libraries and framework
 * version directories are signed without them.
 */
function needsEntitlements(target) {
  if (target.endsWith('.app')) return true
  if (target.endsWith('.framework') || target.endsWith('/Versions/A')) return false
  return !/\.(dylib|so|node)$/.test(target)
}

function sign(target) {
  // --timestamp=none: an ad-hoc signature cannot carry a secure timestamp, and
  // without the flag codesign stalls trying to reach Apple's timestamp server.
  const args = ['--force', '--sign', '-', '--timestamp=none', '--options', 'runtime']
  if (needsEntitlements(target)) args.push('--entitlements', ENTITLEMENTS)
  args.push(target)
  execFileSync('codesign', args, { stdio: ['ignore', 'ignore', 'inherit'] })
}

/**
 * codesign reads the entitlements through AMFI's XML parser, which rejects
 * CRLF and reports only "AMFIUnserializeXML: syntax error near line 1". A
 * Windows working copy produces exactly that file (core.autocrlf), so check it
 * up front and say what is actually wrong.
 */
function checkEntitlements() {
  if (readFileSync(ENTITLEMENTS, 'utf8').includes('\r')) {
    throw new Error(
      `${ENTITLEMENTS} has CRLF line endings; codesign cannot parse it. ` +
        'Convert it to LF (the repository pins *.plist to LF via .gitattributes).'
    )
  }
  execFileSync('plutil', ['-lint', ENTITLEMENTS], { stdio: ['ignore', 'ignore', 'inherit'] })
}

/** Sign every nested binary and then the bundle itself, and verify the result. */
export function signBundle(appPath) {
  checkEntitlements()

  const targets = collectTargets(appPath)
  targets.push(appPath)

  for (const target of targets) sign(target)

  execFileSync('codesign', ['--verify', '--deep', '--strict', appPath], { stdio: 'inherit' })
  console.log(`  • ad-hoc signed ${targets.length} binaries in ${appPath}`)
  // Goes to stderr; the point is to see Identifier and flags in the build log.
  execFileSync('codesign', ['-dv', '--verbose=4', appPath], { stdio: ['ignore', 'ignore', 'inherit'] })
}

/**
 * Intermediate per-arch builds of a universal package, which electron-builder
 * packs into `<appOutDir>-<arch>-temp` before merging them. The hook fires for
 * those too, and signing them breaks the merge: @electron/universal requires
 * every non-binary file to be byte-identical across the two, and a signature
 * puts a differing Contents/_CodeSignature into each. Only the merged bundle
 * gets signed — the merge would invalidate an earlier signature anyway.
 */
const UNIVERSAL_TEMP_DIR = /-(x64|arm64|armv7l|ia32)-temp$/

/** electron-builder afterPack hook. */
export default async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return
  if (UNIVERSAL_TEMP_DIR.test(context.appOutDir)) return
  // A real identity is configured: electron-builder signs after this hook, and
  // an ad-hoc pass here would only be overwritten. Leave the bundle alone.
  if (process.env.CSC_LINK || process.env.CSC_NAME || process.env.CSC_IDENTITY) return

  const appPath = join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`)
  signBundle(appPath)
}

// Direct invocation: `node scripts/adhoc-sign-mac.mjs <path to .app>`.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const target = process.argv[2]
  if (!target) {
    console.error('usage: node scripts/adhoc-sign-mac.mjs <path to .app>')
    process.exit(1)
  }
  signBundle(resolve(target))
}
