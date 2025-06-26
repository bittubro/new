# Newsletter Sender

This project provides a simple Python script (`email_sender.py`) for sending permission-based newsletters using a locally hosted SMTP server. It supports:

- CSV-driven contact lists for personalization.
- Controlled dispatch with batching and throttling.
- Gradual ramp-up of daily send limits for IP reputation management.
- Logging of send results and basic handling of undeliverable messages.
- Plain-text and HTML emails with an unsubscribe notice.

Ensure all recipients have opted in before sending any communication.

## Usage

1. Update `contacts.csv` with your subscriber list (columns: `name`, `email`).
2. Set environment variables for your SMTP server if necessary:

```bash
export SMTP_HOST=localhost
export SMTP_PORT=25
export FROM_ADDR=newsletter@example.com
```

3. Run the script:

```bash
python3 email_sender.py
```

The script keeps track of your daily send limit in `send_history.json` and writes logs to `send.log`.

