# LDAP Authentication Setup

## Overview
The application now uses LDAP authentication against Standard Bank's Active Directory.

## Configuration

### Environment Variables
Set these environment variables or create a `.env` file:

```bash
LDAP_URL=ldaps://ldapadprd.za.sbicdirectory.com:3269
LDAP_BASE=DC=za,DC=sbicdirectory,DC=com
LDAP_BIND_USER=<service_account_username>  # Optional
LDAP_BIND_PASSWORD=<service_account_password>  # Optional
```

### Group Membership
Users must be members of: `sbgdp_infrabrew` group to access the application.

## Installation

1. Install dependencies:
```bash
pip install -r requirements.txt
```

2. Set environment variables (optional - for service account binding):
```bash
export LDAP_BIND_USER="your_service_account"
export LDAP_BIND_PASSWORD="your_password"
```

3. Run the application:
```bash
python server.py
```

## Login
Users should login with their Standard Bank email (e.g., `user@standardbank.co.za`) and their AD password.

## Security Notes
- All LDAP communication uses SSL/TLS (ldaps://)
- Passwords are never stored, only used for authentication
- Session expires after 8 hours
- Users must be in the required AD group
