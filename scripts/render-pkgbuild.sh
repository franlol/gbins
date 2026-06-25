#!/usr/bin/env bash
# Render the AUR PKGBUILD (gbins-bin) from release checksums.
# Usage: render-pkgbuild.sh <version> <tag> <checksums.txt>
set -euo pipefail

version="$1"
tag="$2"
checksums="$3"
repo="franlol/gbins"
base="https://github.com/$repo/releases/download/$tag"

sha() { awk -v f="gbins-$tag-$1.tar.gz" '$2==f{print $1}' "$checksums"; }

cat <<EOF
# Maintainer: franlol
pkgname=gbins-bin
pkgver=$version
pkgrel=1
pkgdesc="GTFOBins in your terminal — fuzzy-search and copy the exploit"
arch=('x86_64' 'aarch64')
url="https://github.com/$repo"
license=('MIT')
provides=('gbins')
conflicts=('gbins')
options=(!strip)
source_x86_64=("gbins-\$pkgver-x86_64.tar.gz::$base/gbins-$tag-linux-x64.tar.gz")
source_aarch64=("gbins-\$pkgver-aarch64.tar.gz::$base/gbins-$tag-linux-arm64.tar.gz")
sha256sums_x86_64=('$(sha linux-x64)')
sha256sums_aarch64=('$(sha linux-arm64)')

package() {
  install -Dm755 "\$srcdir/gbins" "\$pkgdir/usr/bin/gbins"
  install -Dm644 "\$srcdir/LICENSE" "\$pkgdir/usr/share/licenses/\$pkgname/LICENSE"
}
EOF
