// Package migrations embeds the SQL schema migrations into the binary, so applying them doesn't
// depend on the server's working directory.
package migrations

import "embed"

// FS holds every *.up.sql migration, applied in filename (zero-padded numeric prefix) order.
//
//go:embed *.up.sql
var FS embed.FS
