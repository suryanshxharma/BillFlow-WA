import uuid
from datetime import datetime, date
from sqlalchemy import Column, Integer, String, Float, Text, DateTime, Date, ForeignKey
from sqlalchemy.orm import relationship
from app.database import Base

class Business(Base):
    __tablename__ = "businesses"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    owner_name = Column(String, nullable=True)
    phone = Column(String, nullable=True)
    email = Column(String, nullable=True)
    address = Column(Text, nullable=True)
    logo_url = Column(String, nullable=True)
    currency = Column(String, default="₹")  # Currency symbol, e.g. ₹, $, AED
    upi_id = Column(String, nullable=True)   # Merchant UPI ID for QR payments, e.g. merchant@upi
    tax_id_label = Column(String, default="GSTIN") # e.g. GSTIN, VAT, Tax ID
    tax_id_number = Column(String, nullable=True)
    
    # WhatsApp configuration
    whatsapp_template = Column(
        Text, 
        default="Hello *{customer_name}*, \n\nThank you for shopping at *{business_name}*! 🌟\n\nHere is your invoice *#{invoice_number}*.\nTotal Amount: *{currency}{total_amount}*\n\nView & Download your Digital Invoice here:\n🔗 {invoice_url}\n\nHave a great day!"
    )
    wa_api_gateway = Column(String, default="redirect")  # "redirect" or "api"
    wa_api_key = Column(String, nullable=True)
    wa_api_phone_id = Column(String, nullable=True)

    invoices = relationship("Invoice", back_populates="business", cascade="all, delete-orphan")

class Customer(Base):
    __tablename__ = "customers"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    phone = Column(String, nullable=False, index=True)
    email = Column(String, nullable=True)
    address = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    invoices = relationship("Invoice", back_populates="customer")

class Invoice(Base):
    __tablename__ = "invoices"

    id = Column(Integer, primary_key=True, index=True)
    invoice_number = Column(String, unique=True, index=True, nullable=False)
    invoice_hash = Column(String, unique=True, index=True, default=lambda: str(uuid.uuid4()))
    business_id = Column(Integer, ForeignKey("businesses.id"), nullable=False)
    customer_id = Column(Integer, ForeignKey("customers.id"), nullable=False)
    date = Column(Date, default=date.today)
    due_date = Column(Date, nullable=True)
    subtotal = Column(Float, default=0.0)
    discount_total = Column(Float, default=0.0)
    tax_total = Column(Float, default=0.0)
    grand_total = Column(Float, default=0.0)
    payment_status = Column(String, default="Unpaid")  # "Unpaid", "Paid", "Cancelled"
    payment_method = Column(String, default="UPI")      # "UPI", "Cash", "Card"
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    business = relationship("Business", back_populates="invoices")
    customer = relationship("Customer", back_populates="invoices")
    items = relationship("InvoiceItem", back_populates="invoice", cascade="all, delete-orphan")

class InvoiceItem(Base):
    __tablename__ = "invoice_items"

    id = Column(Integer, primary_key=True, index=True)
    invoice_id = Column(Integer, ForeignKey("invoices.id"), nullable=False)
    name = Column(String, nullable=False)
    quantity = Column(Float, default=1.0)
    rate = Column(Float, nullable=False)
    tax_rate = Column(Float, default=0.0)      # Percentage e.g. 18.0 for 18%
    discount_rate = Column(Float, default=0.0) # Percentage e.g. 5.0 for 5%
    total = Column(Float, nullable=False)      # Pre-calculated line item total

    invoice = relationship("Invoice", back_populates="items")

class Campaign(Base):
    __tablename__ = "campaigns"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)
    message_template = Column(Text, nullable=False)
    sent_count = Column(Integer, default=0)
    total_count = Column(Integer, default=0)
    status = Column(String, default="Draft")  # "Draft", "Sending", "Completed"
    created_at = Column(DateTime, default=datetime.utcnow)

class Product(Base):
    __tablename__ = "products"

    id = Column(Integer, primary_key=True, index=True)
    sku = Column(String, unique=True, index=True, nullable=True)
    name = Column(String, unique=True, index=True, nullable=False)
    rate = Column(Float, nullable=False)
    tax_rate = Column(Float, default=18.0)
    stock = Column(Integer, default=0)

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=False)
    salt = Column(String, nullable=False)
    role = Column(String, nullable=False, default="Staff") # "Owner" or "Staff"
    name = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    sessions = relationship("UserSession", back_populates="user", cascade="all, delete-orphan")

class UserSession(Base):
    __tablename__ = "user_sessions"

    token = Column(String, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    expires_at = Column(DateTime, nullable=False)

    user = relationship("User", back_populates="sessions")
