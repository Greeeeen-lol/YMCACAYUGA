# Security Specification - YMCA Tracker

## Data Invariants
- A record must have a valid date (YYYY-MM-DD).
- A record must have a name and nameLower.
- Strikes must be a non-negative integer.
- Preference must be one of: 'snack', 'drink', 'both', 'none'.

## The Dirty Dozen Payloads
1. **The Ghost Field**: Adding `isVerified: true` to a record.
2. **The Huge ID**: Using a 2KB string as a document ID.
3. **The Negative Strike**: Setting `strikes: -1`.
4. **The Type Swap**: Setting `strikes: "5"` instead of an integer.
5. **The Invalid Preference**: Setting `preference: "candy"`.
6. **The Missing Field**: Creating a record without a `date`.
7. **The Future Date**: (Optional) Setting a date 10 years in the future.
8. **The Identity Spoof**: Trying to update a record's `name` to someone else's.
9. **The Notes Overload**: Sending 1MB of text in `notes`.
10. **The Orphan Record**: Creating a record with an empty `name`.
11. **The Status Jump**: (N/A for this app, but relevant for workflow apps).
12. **The Unauthorized Listing**: Trying to list all records without any filter.

## Test Runner
(Will be implemented in firestore.rules.test.ts)
