Score system fixed.

What was wrong:
- '+5 After 1 PM' was shown in text but sometimes not added to numeric score.
- Score could stay 0 even with WU 41.1°C at 1:43 PM.
- Score did not weight WU live temp/momentum/humidity/NOSIG strongly enough.

New score uses:
- IST current time
- latest WU temp
- latest METAR temp
- WU forecast today
- WU momentum
- humidity
- NOSIG
- dust/haze cap
- late-day penalties

At 1:43 PM with WU 41.1°C, score should no longer be 0.

node --check: 0

