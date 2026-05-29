import os
import hashlib
import secrets
from datetime import date, datetime, timedelta
from typing import List, Optional
from fastapi import FastAPI, Depends, HTTPException, status, Request
from fastapi.responses import HTMLResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import desc, or_, func

from app.database import engine, Base, get_db
from app.models import Business, Customer, Invoice, InvoiceItem, Campaign, Product, User, UserSession

# Initialize database tables
Base.metadata.create_all(bind=engine)

app = FastAPI(title="BillFlow WA API", version="1.0.0")

# Setup templates and directories
current_dir = os.path.dirname(os.path.abspath(__file__))
templates_dir = os.path.join(current_dir, "templates")
os.makedirs(templates_dir, exist_ok=True)
templates = Jinja2Templates(directory=templates_dir)

# Ensure public static folder exists
public_dir = os.path.join(os.path.dirname(current_dir), "public")
os.makedirs(public_dir, exist_ok=True)

# Security config
security = HTTPBearer()

# --- SECURITY HELPERS ---
def generate_salt() -> str:
    return secrets.token_hex(16)

def hash_password(password: str, salt: str) -> str:
    return hashlib.sha256((password + salt).encode('utf-8')).hexdigest()

# --- DATABASE SEEDERS ---
def get_or_create_default_business(db: Session) -> Business:
    business = db.query(Business).filter(Business.id == 1).first()
    if not business:
        business = Business(
            id=1,
            name="Alpha Retailers",
            owner_name="Suryansh",
            phone="+919876543210",
            email="support@alpharetail.com",
            address="102, Nebula Heights, Tech Park, Mumbai - 400001",
            logo_url="https://images.unsplash.com/photo-1560179707-f14e90ef3623?w=100&auto=format&fit=crop",
            currency="₹",
            upi_id="suryansh@upi",
            tax_id_label="GSTIN",
            tax_id_number="27AAACB1234C1ZN",
            wa_api_gateway="redirect"
        )
        db.add(business)
        db.commit()
        db.refresh(business)
    return business

def seed_default_admin(db: Session):
    admin = db.query(User).filter(User.username == "admin").first()
    if not admin:
        salt = generate_salt()
        hashed = hash_password("admin123", salt)
        admin = User(
            username="admin",
            password_hash=hashed,
            salt=salt,
            role="Owner",
            name="Owner"
        )
        db.add(admin)
        db.commit()

@app.on_event("startup")
def on_startup():
    db = next(get_db())
    get_or_create_default_business(db)
    seed_default_admin(db)

# --- AUTHORIZATION DEPENDENCIES ---
def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security), db: Session = Depends(get_db)) -> User:
    token = credentials.credentials
    session = db.query(UserSession).filter(UserSession.token == token).first()
    if not session or session.expires_at < datetime.utcnow():
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired session token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return session.user

def get_owner_user(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role != "Owner":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access restricted to Owner role only"
        )
    return current_user


# --- PYDANTIC SCHEMAS ---
class UserLogin(BaseModel):
    username: str
    password: str

class UserCreate(BaseModel):
    username: str
    name: str
    password: str
    role: str  # "Owner" or "Staff"

class UserResponse(BaseModel):
    id: int
    username: str
    name: str
    role: str
    created_at: datetime

    class Config:
        from_attributes = True

class BusinessUpdate(BaseModel):
    name: str
    owner_name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    logo_url: Optional[str] = None
    currency: str = "₹"
    upi_id: Optional[str] = None
    tax_id_label: str = "GSTIN"
    tax_id_number: Optional[str] = None
    whatsapp_template: Optional[str] = None
    wa_api_gateway: str = "redirect"
    wa_api_key: Optional[str] = None
    wa_api_phone_id: Optional[str] = None

class BusinessResponse(BaseModel):
    id: int
    name: str
    owner_name: Optional[str]
    phone: Optional[str]
    email: Optional[str]
    address: Optional[str]
    logo_url: Optional[str]
    currency: str
    upi_id: Optional[str]
    tax_id_label: str
    tax_id_number: Optional[str]
    whatsapp_template: str
    wa_api_gateway: str

    class Config:
        from_attributes = True

class CustomerCreate(BaseModel):
    name: str
    phone: str
    email: Optional[str] = None
    address: Optional[str] = None

class CustomerResponse(BaseModel):
    id: int
    name: str
    phone: str
    email: Optional[str]
    address: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True

class ItemCreate(BaseModel):
    name: str
    quantity: float
    rate: float
    tax_rate: float = 0.0
    discount_rate: float = 0.0

class InvoiceCreate(BaseModel):
    customer_name: str
    customer_phone: str
    customer_email: Optional[str] = None
    customer_address: Optional[str] = None
    items: List[ItemCreate]
    payment_method: str = "UPI"
    notes: Optional[str] = None

class ItemResponse(BaseModel):
    id: int
    name: str
    quantity: float
    rate: float
    tax_rate: float
    discount_rate: float
    total: float

    class Config:
        from_attributes = True

class InvoiceResponse(BaseModel):
    id: int
    invoice_number: str
    invoice_hash: str
    date: date
    subtotal: float
    discount_total: float
    tax_total: float
    grand_total: float
    payment_status: str
    payment_method: str
    notes: Optional[str]
    customer: CustomerResponse
    items: List[ItemResponse]

    class Config:
        from_attributes = True

class CampaignCreate(BaseModel):
    title: str
    message_template: str
    total_count: int

class CampaignProgressUpdate(BaseModel):
    sent_count: int
    status: str

class CampaignResponse(BaseModel):
    id: int
    title: str
    message_template: str
    sent_count: int
    total_count: int
    status: str
    created_at: datetime

    class Config:
        from_attributes = True

class ProductCreate(BaseModel):
    sku: Optional[str] = None
    name: str
    rate: float
    tax_rate: float = 18.0
    stock: int = 0

class ProductUpdate(BaseModel):
    sku: Optional[str] = None
    name: str
    rate: float
    tax_rate: float = 18.0
    stock: int = 0

class ProductResponse(BaseModel):
    id: int
    sku: Optional[str]
    name: str
    rate: float
    tax_rate: float
    stock: int

    class Config:
        from_attributes = True


# --- API ENDPOINTS ---

# 1. AUTHENTICATION SERVICES
@app.post("/api/auth/login")
def login(data: UserLogin, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == data.username).first()
    if not user:
        raise HTTPException(status_code=400, detail="Invalid username or password")
    
    hashed = hash_password(data.password, user.salt)
    if hashed != user.password_hash:
        raise HTTPException(status_code=400, detail="Invalid username or password")
    
    # Create session token
    token = secrets.token_hex(32)
    session = UserSession(
        token=token,
        user_id=user.id,
        expires_at=datetime.utcnow() + timedelta(hours=24)
    )
    db.add(session)
    db.commit()
    
    return {
        "token": token,
        "user": {
            "username": user.username,
            "role": user.role,
            "name": user.name
        }
    }

@app.post("/api/auth/logout")
def logout(credentials: HTTPAuthorizationCredentials = Depends(security), db: Session = Depends(get_db)):
    token = credentials.credentials
    session = db.query(UserSession).filter(UserSession.token == token).first()
    if session:
        db.delete(session)
        db.commit()
    return {"message": "Logged out successfully"}

@app.get("/api/auth/me")
def get_me(current_user: User = Depends(get_current_user)):
    return {
        "username": current_user.username,
        "role": current_user.role,
        "name": current_user.name
    }


# 2. USER ADMINISTRATION (Owner-Only)
@app.get("/api/users", response_model=List[UserResponse])
def list_users(db: Session = Depends(get_db), owner: User = Depends(get_owner_user)):
    return db.query(User).order_by(desc(User.created_at)).all()

@app.post("/api/users", response_model=UserResponse)
def create_user(data: UserCreate, db: Session = Depends(get_db), owner: User = Depends(get_owner_user)):
    existing = db.query(User).filter(User.username == data.username).first()
    if existing:
        raise HTTPException(status_code=400, detail="Username already exists")
    
    if data.role not in ["Owner", "Staff"]:
        raise HTTPException(status_code=400, detail="Invalid role specified")
        
    salt = generate_salt()
    hashed = hash_password(data.password, salt)
    
    new_user = User(
        username=data.username,
        name=data.name,
        password_hash=hashed,
        salt=salt,
        role=data.role
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user

@app.delete("/api/users/{user_id}")
def delete_user(user_id: int, db: Session = Depends(get_db), owner: User = Depends(get_owner_user)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    if user.username == "admin" or user.id == owner.id:
        raise HTTPException(status_code=400, detail="Cannot delete default admin or currently logged-in Owner")
        
    db.delete(user)
    db.commit()
    return {"message": f"User {user.username} deleted successfully"}


# 3. SALES ANALYTICS SERVICES (Owner-Only)
@app.get("/api/analytics/sales-trend")
def get_sales_trend(db: Session = Depends(get_db), owner: User = Depends(get_owner_user)):
    thirty_days_ago = date.today() - timedelta(days=30)
    sales = db.query(
        Invoice.date,
        func.sum(Invoice.grand_total).label("total")
    ).filter(
        Invoice.payment_status == "Paid",
        Invoice.date >= thirty_days_ago
    ).group_by(Invoice.date).order_by(Invoice.date).all()
    
    return [{"date": s[0].isoformat(), "total": round(s[1], 2)} for s in sales]

@app.get("/api/analytics/payment-distribution")
def get_payment_distribution(db: Session = Depends(get_db), owner: User = Depends(get_owner_user)):
    dist = db.query(
        Invoice.payment_method,
        func.sum(Invoice.grand_total).label("total"),
        func.count(Invoice.id).label("count")
    ).filter(
        Invoice.payment_status == "Paid"
    ).group_by(Invoice.payment_method).all()
    
    return [
        {
            "method": d[0],
            "total": round(d[1], 2),
            "count": d[2]
        } for d in dist
    ]

@app.get("/api/analytics/top-products")
def get_top_products(db: Session = Depends(get_db), owner: User = Depends(get_owner_user)):
    top = db.query(
        InvoiceItem.name,
        func.sum(InvoiceItem.quantity).label("quantity"),
        func.sum(InvoiceItem.total).label("total")
    ).join(Invoice).filter(
        Invoice.payment_status == "Paid"
    ).group_by(InvoiceItem.name).order_by(desc("quantity")).limit(10).all()
    
    return [
        {
            "name": t[0],
            "quantity": t[1],
            "total": round(t[2], 2)
        } for t in top
    ]


# 4. BUSINESS CONFIGURATION
@app.get("/api/business", response_model=BusinessResponse)
def get_business(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return get_or_create_default_business(db)

@app.put("/api/business", response_model=BusinessResponse)
def update_business(updated: BusinessUpdate, db: Session = Depends(get_db), owner: User = Depends(get_owner_user)):
    business = get_or_create_default_business(db)
    for key, value in updated.model_dump(exclude_unset=True).items():
        setattr(business, key, value)
    db.commit()
    db.refresh(business)
    return business


# 5. CUSTOMERS
@app.get("/api/customers", response_model=List[CustomerResponse])
def list_customers(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return db.query(Customer).order_by(desc(Customer.created_at)).all()

@app.get("/api/customers/search", response_model=List[CustomerResponse])
def search_customers(q: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return db.query(Customer).filter(
        or_(
            Customer.name.ilike(f"%{q}%"),
            Customer.phone.ilike(f"%{q}%")
        )
    ).limit(5).all()

@app.post("/api/customers", response_model=CustomerResponse)
def create_customer(customer_data: CustomerCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    phone_clean = "".join(filter(str.isdigit, customer_data.phone))
    if not phone_clean.startswith("+") and len(phone_clean) >= 10:
        if len(phone_clean) == 10:
            phone_clean = f"+91{phone_clean}"
        else:
            phone_clean = f"+{phone_clean}"
            
    existing = db.query(Customer).filter(Customer.phone == phone_clean).first()
    if existing:
        return existing
        
    customer = Customer(
        name=customer_data.name,
        phone=phone_clean,
        email=customer_data.email,
        address=customer_data.address
    )
    db.add(customer)
    db.commit()
    db.refresh(customer)
    return customer


# 6. INVOICES
@app.get("/api/invoices", response_model=List[InvoiceResponse])
def list_invoices(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return db.query(Invoice).order_by(desc(Invoice.created_at)).all()

@app.post("/api/invoices", response_model=InvoiceResponse)
def create_invoice(data: InvoiceCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    business = get_or_create_default_business(db)
    
    phone_clean = "".join(filter(str.isdigit, data.customer_phone))
    if not data.customer_phone.startswith("+") and len(phone_clean) >= 10:
        if len(phone_clean) == 10:
            phone_clean = f"+91{phone_clean}"
        else:
            phone_clean = f"+{phone_clean}"
    else:
        phone_clean = data.customer_phone
        
    customer = db.query(Customer).filter(Customer.phone == phone_clean).first()
    if not customer:
        customer = Customer(
            name=data.customer_name,
            phone=phone_clean,
            email=data.customer_email,
            address=data.customer_address
        )
        db.add(customer)
        db.flush()
    
    today_str = datetime.now().strftime("%Y%m%d")
    count = db.query(Invoice).filter(Invoice.invoice_number.like(f"BF-{today_str}-%")).count()
    invoice_number = f"BF-{today_str}-{(count + 1):04d}"
    
    invoice = Invoice(
        invoice_number=invoice_number,
        business_id=business.id,
        customer_id=customer.id,
        payment_method=data.payment_method,
        notes=data.notes,
        payment_status="Unpaid"
    )
    db.add(invoice)
    db.flush()
    
    subtotal = 0.0
    discount_total = 0.0
    tax_total = 0.0
    
    for item in data.items:
        base = item.rate * item.quantity
        disc = base * (item.discount_rate / 100.0)
        discounted = base - disc
        tax = discounted * (item.tax_rate / 100.0)
        item_total = discounted + tax
        
        subtotal += base
        discount_total += disc
        tax_total += tax
        
        db_item = InvoiceItem(
            invoice_id=invoice.id,
            name=item.name,
            quantity=item.quantity,
            rate=item.rate,
            tax_rate=item.tax_rate,
            discount_rate=item.discount_rate,
            total=item_total
        )
        db.add(db_item)
        
        # Mini-Inventory Stock Deduction
        prod = db.query(Product).filter(Product.name.ilike(item.name)).first()
        if prod:
            prod.stock = max(0, int(prod.stock - item.quantity))
        
    invoice.subtotal = round(subtotal, 2)
    invoice.discount_total = round(discount_total, 2)
    invoice.tax_total = round(tax_total, 2)
    invoice.grand_total = round(subtotal - discount_total + tax_total, 2)
    
    db.commit()
    db.refresh(invoice)
    return invoice

@app.put("/api/invoices/{invoice_id}/status", response_model=InvoiceResponse)
def update_invoice_status(invoice_id: int, status_update: dict, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    new_status = status_update.get("status")
    if new_status not in ["Paid", "Unpaid", "Cancelled"]:
        raise HTTPException(status_code=400, detail="Invalid payment status")
        
    invoice = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
        
    old_status = invoice.payment_status
    
    if old_status != "Cancelled" and new_status == "Cancelled":
        # Restore stock levels
        for item in invoice.items:
            prod = db.query(Product).filter(Product.name.ilike(item.name)).first()
            if prod:
                prod.stock = int(prod.stock + item.quantity)
                
    elif old_status == "Cancelled" and new_status != "Cancelled":
        # Deduct stock levels again
        for item in invoice.items:
            prod = db.query(Product).filter(Product.name.ilike(item.name)).first()
            if prod:
                prod.stock = max(0, int(prod.stock - item.quantity))
                
    invoice.payment_status = new_status
    db.commit()
    db.refresh(invoice)
    return invoice

@app.delete("/api/invoices/{invoice_id}")
def delete_invoice(invoice_id: int, db: Session = Depends(get_db), owner: User = Depends(get_owner_user)):
    invoice = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
        
    # Restore stock if invoice was not already cancelled before deleting
    if invoice.payment_status != "Cancelled":
        for item in invoice.items:
            prod = db.query(Product).filter(Product.name.ilike(item.name)).first()
            if prod:
                prod.stock = int(prod.stock + item.quantity)
                
    db.delete(invoice)
    db.commit()
    return {"message": f"Invoice {invoice_id} successfully deleted"}


# 7. CAMPAIGNS (MASS MESSAGING) (Owner-Only)
@app.get("/api/campaigns", response_model=List[CampaignResponse])
def list_campaigns(db: Session = Depends(get_db), owner: User = Depends(get_owner_user)):
    return db.query(Campaign).order_by(desc(Campaign.created_at)).all()

@app.post("/api/campaigns", response_model=CampaignResponse)
def create_campaign(data: CampaignCreate, db: Session = Depends(get_db), owner: User = Depends(get_owner_user)):
    campaign = Campaign(
        title=data.title,
        message_template=data.message_template,
        sent_count=0,
        total_count=data.total_count,
        status="Draft"
    )
    db.add(campaign)
    db.commit()
    db.refresh(campaign)
    return campaign

@app.put("/api/campaigns/{campaign_id}/progress", response_model=CampaignResponse)
def update_campaign_progress(campaign_id: int, data: CampaignProgressUpdate, db: Session = Depends(get_db), owner: User = Depends(get_owner_user)):
    campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    campaign.sent_count = data.sent_count
    campaign.status = data.status
    db.commit()
    db.refresh(campaign)
    return campaign

@app.delete("/api/campaigns/{campaign_id}")
def delete_campaign(campaign_id: int, db: Session = Depends(get_db), owner: User = Depends(get_owner_user)):
    campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    db.delete(campaign)
    db.commit()
    return {"message": f"Campaign {campaign_id} successfully deleted"}


# 8. PRODUCTS & INVENTORY (Owner & Staff CRUD, Deletion Owner-Only)
@app.get("/api/products", response_model=List[ProductResponse])
def list_products(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return db.query(Product).order_by(Product.name).all()

@app.get("/api/products/search", response_model=List[ProductResponse])
def search_products(q: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return db.query(Product).filter(
        or_(
            Product.name.ilike(f"%{q}%"),
            Product.sku.ilike(f"%{q}%")
        )
    ).limit(10).all()

@app.post("/api/products", response_model=ProductResponse)
def create_product(data: ProductCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    # Staff or Owner is authorized to ADD products to catalog
    existing = db.query(Product).filter(Product.name.ilike(data.name)).first()
    if existing:
        raise HTTPException(status_code=400, detail="Product with this name already exists")
    if data.sku:
        existing_sku = db.query(Product).filter(Product.sku.ilike(data.sku)).first()
        if existing_sku:
            raise HTTPException(status_code=400, detail="Product with this SKU already exists")

    product = Product(
        sku=data.sku or None,
        name=data.name,
        rate=data.rate,
        tax_rate=data.tax_rate,
        stock=data.stock
    )
    db.add(product)
    db.commit()
    db.refresh(product)
    return product

@app.put("/api/products/{product_id}", response_model=ProductResponse)
def update_product(product_id: int, data: ProductUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    # Staff or Owner is authorized to EDIT products in catalog
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    
    if data.name.lower() != product.name.lower():
        existing = db.query(Product).filter(Product.name.ilike(data.name)).first()
        if existing:
            raise HTTPException(status_code=400, detail="Product with this name already exists")
            
    if data.sku and (not product.sku or data.sku.lower() != product.sku.lower()):
        existing_sku = db.query(Product).filter(Product.sku.ilike(data.sku)).first()
        if existing_sku:
            raise HTTPException(status_code=400, detail="Product with this SKU already exists")

    product.name = data.name
    product.sku = data.sku or None
    product.rate = data.rate
    product.tax_rate = data.tax_rate
    product.stock = data.stock
    
    db.commit()
    db.refresh(product)
    return product

@app.delete("/api/products/{product_id}")
def delete_product(product_id: int, db: Session = Depends(get_db), owner: User = Depends(get_owner_user)):
    # Strictly Owner-Only to delete product catalog entries
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    db.delete(product)
    db.commit()
    return {"message": f"Product {product_id} successfully deleted"}


# --- PUBLIC & VIEW ENDPOINTS ---

# 9. DIGITAL RECEIPT PAGE
@app.get("/receipt/{invoice_hash}", response_class=HTMLResponse)
def render_receipt(request: Request, invoice_hash: str, db: Session = Depends(get_db)):
    invoice = db.query(Invoice).filter(Invoice.invoice_hash == invoice_hash).first()
    if not invoice:
        return HTMLResponse("<h1>Invoice Not Found</h1>", status_code=404)
        
    business = invoice.business
    customer = invoice.customer
    
    upi_payment_url = None
    if business.upi_id:
        business_name_clean = business.name.replace(" ", "%20")
        upi_payment_url = f"upi://pay?pa={business.upi_id}&pn={business_name_clean}&am={invoice.grand_total}&cu=INR"
        
    return templates.TemplateResponse(
        request=request,
        name="receipt.html",
        context={
            "invoice": invoice,
            "business": business,
            "customer": customer,
            "items": invoice.items,
            "upi_payment_url": upi_payment_url
        }
    )


# 10. SERVE FRONTEND STATIC FILES
@app.get("/", response_class=FileResponse)
def serve_index():
    index_path = os.path.join(public_dir, "index.html")
    if not os.path.exists(index_path):
        return HTMLResponse("<h1>BillFlow WA Front-End is Under Construction</h1>", status_code=200)
    response = FileResponse(index_path)
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    return response

@app.get("/styles.css")
def serve_css():
    css_path = os.path.join(public_dir, "styles.css")
    if os.path.exists(css_path):
        response = FileResponse(css_path)
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
        return response
    return HTMLResponse("/* styles.css */", media_type="text/css")

@app.get("/app.js")
def serve_js():
    js_path = os.path.join(public_dir, "app.js")
    if os.path.exists(js_path):
        response = FileResponse(js_path)
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
        return response
    return HTMLResponse("/* app.js */", media_type="application/javascript")