# Demo Script — SafeTracks Receipt Geometry

Use this script when presenting `docs/demo-walkthrough.webm` or driving a live demo of the app.

## Video walkthrough

`docs/demo-walkthrough.webm` is a silent screen recording covering:

1. Dashboard opens with the 3D receipt geometry and the "How to Read This Geometry" panel visible.
2. The governance-layer filter changes from **All Layers** to **Municipal**.
3. A node is clicked, opening the **Zero-PII Audit Receipt** inspector.
4. The filter returns to **All Layers** and the ledger feed keeps appending receipts.
5. The **LIVE RECEIPT STREAM** toggle pauses and then resumes the feed.

The recording has no audio narration. Use the script below as voiceover, live narration, or captions when sharing the video.

## Narration

**Opening**

> This is SafeTracks Receipt Geometry. It is not a surveillance dashboard. It does not map people, GPS points, case files, or medical records.

**Core explanation**

> Each node is a Zero-PII receipt showing that a public health system action occurred. The geometry maps receipts by civic bucket, governance layer, and evidence category — never by location or identity.

**Filter and inspector**

> Filtering to the Municipal layer narrows both the graph and the ledger feed together. Clicking any receipt opens the inspector, which shows only non-identifying metadata: domain, category, spatial and temporal bucket, a synthetic proof reference, and general audit notes.

**Ledger and live stream**

> The bottom ledger is an append-only feed of receipts. The live stream toggle pauses and resumes new synthetic receipts arriving in real time — this simulates, but does not connect to, a real notarized ledger.

**Closing**

> The purpose is simple: make public health work auditable without turning people into records.

## Longer stakeholder script

For an in-person or live-call demo, use the fuller script from the main [README](../README.md#9-demo-script-for-stakeholders), which adds a lifecycle walkthrough (a public hazard report moving toward a verified municipal response) and an explicit privacy framing statement.
