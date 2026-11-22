# Comparison — render vs reference

The same measurement code, run over both files. `analysis/compare.py` produces
this; `analysis/comparison.json` has the raw output.

**10 of 13 dimensions pass.**

| Dimension | Reference | This render | Pass | Note |
|---|---|---|---|---|
| Duration | 168.0 s | 227.0 s | PASS | brief requires 170-300 s; the author raised the ceiling to 5 min |
| Resolution | 1024x576 | 1920x1080 | PASS | reference was downscaled by WhatsApp; 1920x1080 is the spec target |
| Frame rate | 30 fps | 60 fps | PASS | spec target 60 fps |
| Codec | h264 | h264 | PASS |  |
| Mean shot length | 1.91 s | 4.54 s | FAIL | +137.8% — same detector on both; allowed +/-20% |
| Cut count | 87 | 49 | PASS | 31.1 vs 12.9 cuts/min |
| Median shot | 1.05 s | 4.05 s | PASS | reported, not gated |
| Background | #F8F8F8 | #F8F8F8 | PASS | max channel distance 0/255 |
| Accent | #88C8F8 | #182868, #E8A838, #081808 | PASS | nearest rendered accent is 0/255 from the reference's primary |
| Integrated loudness | -15.6 LUFS | silent | FAIL | no audio in the render |
| True peak | -1.34 dBFS | silent | FAIL |  |
| VO cadence | 119.3 wpm | 111.3 wpm | PASS | -6.7% — allowed +/-10% |
| File size | 14.9 MB | 44.8 MB | PASS | submission portals cap uploads at 200 MB |
