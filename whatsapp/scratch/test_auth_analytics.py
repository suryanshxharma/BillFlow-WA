import urllib.request
import json
import time

BASE_URL = "http://127.0.0.1:8000"

def make_request(url, method="GET", data=None, token=None):
    req = urllib.request.Request(url, method=method)
    if data is not None:
        req.add_header("Content-Type", "application/json")
        json_data = json.dumps(data).encode("utf-8")
        req.data = json_data
    if token is not None:
        req.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(req) as response:
            return response.status, json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read().decode("utf-8"))
        except Exception:
            return e.code, e.read().decode("utf-8")

def run_verification():
    print("=== STARTING AUTH & ACCESS CONTROL VERIFICATION SYSTEM ===")

    # 1. Verify protected endpoint blocks anonymous request (should return 401)
    status, body = make_request(f"{BASE_URL}/api/auth/me")
    print(f"Anonymous GET /api/auth/me response status: {status}")
    assert status == 401, "Anonymous request should be blocked with 401"
    print("✓ ANONYMOUS REQUEST BLOCKED SUCCESSFULLY!")

    # 2. Login as Owner using seeded admin credentials
    login_payload = {
        "username": "admin",
        "password": "admin123"
    }
    status, auth_data = make_request(f"{BASE_URL}/api/auth/login", method="POST", data=login_payload)
    print(f"Admin Login response status: {status}")
    assert status == 200, "Admin login should succeed"
    admin_token = auth_data["token"]
    print(f"Seeded Admin Token: {admin_token[:10]}...")
    print("✓ ADMIN OWNER LOGIN SUCCESSFUL!")

    # 3. Verify owner can query their profile (/api/auth/me)
    status, profile = make_request(f"{BASE_URL}/api/auth/me", token=admin_token)
    print(f"Owner Profile request status: {status}, Username: {profile['username']}, Role: {profile['role']}")
    assert status == 200 and profile["role"] == "Owner", "Owner profile fetch failed"
    print("✓ OWNER ME QUERY SUCCESSFUL!")

    # 4. Provision a new Staff user (Owner-Only endpoint)
    staff_payload = {
        "username": "siddharth_test",
        "name": "Siddharth",
        "password": "staffpassword123",
        "role": "Staff"
    }
    
    # Try to clean up existing user from previous runs if any
    status, users = make_request(f"{BASE_URL}/api/users", token=admin_token)
    for u in users:
        if u["username"] == "siddharth_test":
            make_request(f"{BASE_URL}/api/users/{u['id']}", method="DELETE", token=admin_token)

    status, new_user = make_request(f"{BASE_URL}/api/users", method="POST", data=staff_payload, token=admin_token)
    print(f"Owner provision staff account response status: {status}")
    assert status == 200, "Failed to provision new staff user"
    print(f"Staff User Created: ID={new_user['id']}, Username={new_user['username']}, Role={new_user['role']}")
    print("✓ OWNER STAFF USER CREATION SUCCESSFUL!")

    # 5. Login as Siddharth (Staff)
    staff_login_payload = {
        "username": "siddharth_test",
        "password": "staffpassword123"
    }
    status, staff_auth_data = make_request(f"{BASE_URL}/api/auth/login", method="POST", data=staff_login_payload)
    print(f"Staff Login response status: {status}")
    assert status == 200, "Staff login should succeed"
    staff_token = staff_auth_data["token"]
    print(f"Staff Token: {staff_token[:10]}...")
    print("✓ STAFF LOGIN SUCCESSFUL!")

    # 6. Verify Staff CANNOT call Owner-only endpoint (e.g. Sales Analytics trend, should return 403)
    status, err_body = make_request(f"{BASE_URL}/api/analytics/sales-trend", token=staff_token)
    print(f"Staff GET /api/analytics/sales-trend response status: {status}")
    assert status == 403, "Staff should receive 403 Forbidden on analytics endpoints"
    print("✓ STAFF ANALYTICS ACCESS BLOCKED SUCCESSFULLY!")

    # 7. Verify Staff CANNOT call user management endpoints (should return 403)
    status, err_body = make_request(f"{BASE_URL}/api/users", token=staff_token)
    print(f"Staff GET /api/users response status: {status}")
    assert status == 403, "Staff should receive 403 Forbidden on users directory"
    print("✓ STAFF USER DIRECTORY ACCESS BLOCKED SUCCESSFULLY!")

    # 8. Verify Staff CAN call staff-allowed endpoints (e.g. GET products)
    status, products = make_request(f"{BASE_URL}/api/products", token=staff_token)
    print(f"Staff GET /api/products response status: {status}")
    assert status == 200, "Staff should be allowed to view products catalog"
    print("✓ STAFF PRODUCTS CATALOG VIEW SUCCESSFUL!")

    # 9. Clean up Siddharth (Staff) user profile
    status, del_resp = make_request(f"{BASE_URL}/api/users/{new_user['id']}", method="DELETE", token=admin_token)
    print(f"Owner deleted staff account response status: {status}")
    assert status == 200, "Owner failed to delete staff account"
    print("✓ OWNER STAFF ACCOUNT CLEANUP SUCCESSFUL!")

    print("=== ALL MULTI-USER RBAC GATEWAY TESTS PASSED SUCCESSFULLY! ===")

if __name__ == "__main__":
    run_verification()
