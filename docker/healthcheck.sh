#!/bin/sh
# Sehat = PostgreSQL menerima koneksi DAN Next.js melayani HTTP. /logo.svg adalah
# berkas statis publik — tidak butuh login maupun query database.
pg_isready -q -h 127.0.0.1 -p 5432 || exit 1
exec node -e "fetch('http://127.0.0.1:3000/logo.svg').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"
