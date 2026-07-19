# CCX-602 File preview and details

Exact File routes now have a compact detail contract with Preview, Details,
Activity, Sharing, and Related tabs. The contract reuses CCX-600 authorization
and File identity. It returns bounded display metadata, sanitized activity, and
exact related-object links; it never returns a raw source record.

Image, PDF, Markdown, and text previews use an authorized same-origin content
endpoint unless CCX-600 has proved a URL explicitly public. Link artifacts open
only that reviewed public URL. Unsupported types retain details and authorized
open/download actions. A storage URL never implies public sharing.
