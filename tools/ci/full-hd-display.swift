// Switches the main display to 1920 x 1080, for nightly.yml's E2E on macOS.
//
// The runner's display starts at 1024 x 768, and macOS keeps a window inside
// its screen: the app opened in its narrow layout, and every test written for
// the room it has on a full-HD screen failed. The runner's virtual display
// offers larger modes; this picks the smallest of at least 1920 x 1080.
// Fails, saying so, when there is none.
import CoreGraphics
import Foundation

let display = CGMainDisplayID()
let options = [kCGDisplayShowDuplicateLowResolutionModes: kCFBooleanTrue] as CFDictionary
let modes = (CGDisplayCopyAllDisplayModes(display, options) as? [CGDisplayMode]) ?? []
let large = modes.filter { $0.width >= 1920 && $0.height >= 1080 }
guard let mode = large.min(by: { $0.width * $0.height < $1.width * $1.height }) else {
  print("::error title=Display::No mode of at least 1920 x 1080; the display offers \(modes.map { "\($0.width) x \($0.height)" }).")
  exit(1)
}
var config: CGDisplayConfigRef?
CGBeginDisplayConfiguration(&config)
CGConfigureDisplayWithDisplayMode(config, display, mode, nil)
let result = CGCompleteDisplayConfiguration(config, .permanently)
guard result == .success else {
  print("::error title=Display::Switching to \(mode.width) x \(mode.height) failed: \(result.rawValue).")
  exit(1)
}
print("The display is \(CGDisplayPixelsWide(display)) x \(CGDisplayPixelsHigh(display)).")
