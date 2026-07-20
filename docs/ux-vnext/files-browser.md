# CCX-601 Files browser

The Files browser consumes the merged CCX-600 `FileView`; it does not introduce
another File model or copy source records. The compact read applies source
authorization before search, facets, counts, sorting, or pagination. Cursors are
opaque, signed, and bound to the active filters.

Views are Home, All files, Recent, Starred, Shared, and Trash. Collections are
Brand Assets, Partner Files, Campaign Assets, Investor Room, and Compliance &
Evidence. A collection is presentation metadata on its authoritative record,
not a duplicate folder tree. Missing owner, status, date, and collection values
render as unavailable.

`New` opens the reviewed Global Create File flow. Runtime endpoint, stylesheet,
controller, and route registration remain Integration-owned and are enumerated
in the Files train manifest.
