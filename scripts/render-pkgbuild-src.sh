#!/usr/bin/env bash
# Render the AUR PKGBUILD (gbins, built from source with bun).
# Usage: render-pkgbuild-src.sh <version> <tag> <source-tarball-sha256>
set -euo pipefail

version="$1"
tag="$2"
src_sha="$3"
repo="franlol/gbins"

cat <<EOF
# Maintainer: franlol
pkgname=gbins
pkgver=$version
pkgrel=1
pkgdesc="GTFOBins in your terminal — fuzzy-search and copy the exploit"
arch=('x86_64' 'aarch64')
url="https://github.com/$repo"
license=('MIT')
makedepends=('bun')
conflicts=('gbins-bin')
options=(!strip)
source=("gbins-\$pkgver.tar.gz::https://github.com/$repo/archive/refs/tags/$tag.tar.gz")
sha256sums=('$src_sha')

build() {
  cd "\$srcdir/gbins-$version"
  bun install --frozen-lockfile
  bun build --compile src/index.tsx --outfile gbins
}

package() {
  cd "\$srcdir/gbins-$version"
  install -Dm755 gbins "\$pkgdir/usr/bin/gbins"
  install -Dm644 LICENSE "\$pkgdir/usr/share/licenses/\$pkgname/LICENSE"
}
EOF
