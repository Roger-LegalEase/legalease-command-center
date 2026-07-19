# CCX-605 reports and evidence as Files

The Files report adapter calls an existing authoritative generator and then opens
the exact resulting `report:<id>` FileView. It never creates a data-room mirror
or a second report. A stable request ID prevents duplicate generation. Draft and
generation time remain visible.

Choosing a Files collection updates only organization metadata on the same
report record through a scoped, freshness-aware write with activity and audit
evidence. Existing evidence notes and SOC 2 evidence remain discoverable through
their CCX-600 source projections; their bodies are not copied.
