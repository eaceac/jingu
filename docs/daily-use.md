# Daily use

Start Jingu locally with `npm run dev` or, on a configured Mac, `./scripts/start-mac.sh`. Open `http://localhost:3000/practice` and sign in using your private website credentials.

Choose Enable practice once, then Practice. Type answers directly without a prefix. Use Progress or visit the garden to see today's activity. Settings commands include `WORDS 5`, `DIRECTION forward`, `DIRECTION reverse`, `DIRECTION mixed`, and `TRANSLITERATION on` or `off`. Enter `DONE` to end a session. `STOP` pauses practice; `START` enables it again.

Complete your daily goal to grow the garden. Naming a patch does not count as practice. API credits must be available for live grading. If grading fails, no review is awarded; fix the connection or billing issue before retrying.

The website is local to the Mac. No external tunnel or messaging bridge is part of the supported setup. Closing the running process stops access, but PostgreSQL retains progress.
