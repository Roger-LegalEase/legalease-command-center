# CCX-404 Campaign audience step

The Audience projection reads selected Partner and customer references without copying recipients into another collection. Saved segments expand only from authoritative visible segment membership. Supported filters are stage, type, geography, owner, status, and tag when those fields exist.

Every selected record is revalidated server-side against current holds, do-not-contact state, unsubscribes, suppressions, bounces, complaints, and delivery-address validity. Included and excluded lists are separate and every exclusion has a plain-language reason. `executionInput` contains exactly the eligible references used for the displayed included count and carries a deterministic fingerprint for Review/launch parity. Browser input cannot restore an excluded record. The preview is paginated and omits delivery addresses and unnecessary recipient content.
