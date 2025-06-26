import csv
import json
import logging
import os
import smtplib
import time
from datetime import datetime
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

CONTACTS_FILE = 'contacts.csv'
HISTORY_FILE = 'send_history.json'
LOG_FILE = 'send.log'

INITIAL_LIMIT = 100
MAX_LIMIT = 1000
RAMP_STEP = 100
BATCH_SIZE = 20
THROTTLE_SECONDS = 2

SMTP_HOST = os.environ.get('SMTP_HOST', 'localhost')
SMTP_PORT = int(os.environ.get('SMTP_PORT', 25))
FROM_ADDR = os.environ.get('FROM_ADDR', 'newsletter@example.com')

logging.basicConfig(level=logging.INFO, filename=LOG_FILE,
                    format='%(asctime)s %(levelname)s %(message)s')

def load_contacts(path=CONTACTS_FILE):
    contacts = []
    with open(path, newline='', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            name = row.get('name')
            email = row.get('email')
            if name and email:
                contacts.append({'name': name, 'email': email})
    return contacts

def load_history(path=HISTORY_FILE):
    if not os.path.exists(path):
        return {'date': datetime.utcnow().date().isoformat(),
                'limit': INITIAL_LIMIT, 'count': 0}
    with open(path, 'r', encoding='utf-8') as f:
        return json.load(f)

def save_history(history, path=HISTORY_FILE):
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(history, f)

def get_today_limit():
    history = load_history()
    today = datetime.utcnow().date().isoformat()
    if history['date'] != today:
        history['date'] = today
        if history['limit'] < MAX_LIMIT:
            history['limit'] = min(history['limit'] + RAMP_STEP, MAX_LIMIT)
        history['count'] = 0
        save_history(history)
    return history

def build_message(contact, subject, html_body=None, text_body=None):
    msg = MIMEMultipart('alternative')
    msg['Subject'] = subject
    msg['From'] = FROM_ADDR
    msg['To'] = contact['email']

    unsubscribe = '\n\nIf you no longer wish to receive these emails, please visit https://example.com/unsubscribe.'
    if text_body:
        text = text_body.format(name=contact['name']) + unsubscribe
        msg.attach(MIMEText(text, 'plain', 'utf-8'))
    if html_body:
        html = html_body.format(name=contact['name']) + '<br><br>' + \
            '<p>If you no longer wish to receive these emails, ' + \
            '<a href="https://example.com/unsubscribe">unsubscribe here</a>.</p>'
        msg.attach(MIMEText(html, 'html', 'utf-8'))
    return msg

def send_emails(subject, html_body=None, text_body=None):
    contacts = load_contacts()
    history = get_today_limit()
    remaining = history['limit'] - history['count']
    if remaining <= 0:
        logging.warning('Daily send limit reached.')
        print('Daily send limit reached.')
        return

    send_count = 0
    with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as smtp:
        for idx, contact in enumerate(contacts):
            if send_count >= remaining:
                break
            msg = build_message(contact, subject, html_body, text_body)
            try:
                smtp.sendmail(FROM_ADDR, [contact['email']], msg.as_string())
                logging.info('Sent to %s', contact['email'])
            except smtplib.SMTPException as e:
                logging.error('Failed to send to %s: %s', contact['email'], e)
            send_count += 1
            if send_count % BATCH_SIZE == 0:
                time.sleep(THROTTLE_SECONDS)

    history['count'] += send_count
    save_history(history)
    print(f'Sent {send_count} message(s).')

if __name__ == '__main__':
    SUBJECT = 'Monthly Newsletter'
    TEXT_BODY = 'Hello {name},\n\nThis is our monthly update.'
    HTML_BODY = '<p>Hello {name},</p><p>This is our monthly update.</p>'
    send_emails(SUBJECT, html_body=HTML_BODY, text_body=TEXT_BODY)
