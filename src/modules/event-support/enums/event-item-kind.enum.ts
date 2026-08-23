/** "Paket" (a bundled package, e.g. "Medium Venue Package") vs "Add on"
 * (a standalone extra, e.g. "DJ Set") — the two fixed sections the client
 * catalog renders within each category tab, per the FE mockup. */
export enum EventItemKind {
  PACKAGE = 'package',
  ADDON = 'addon',
}
