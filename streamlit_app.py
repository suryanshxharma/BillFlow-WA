import streamlit as st
import sqlite3
import pandas as pd
import os

# Connect to database
DB_PATH = 'whatsapp/billflow.db'

def get_db_connection():
    # Use absolute path relative to repo root
    abs_path = os.path.abspath(DB_PATH)
    conn = sqlite3.connect(abs_path)
    conn.row_factory = sqlite3.Row
    return conn

st.set_page_config(page_title="BillFlow WA Dashboard", layout="wide")

st.title("BillFlow WA - Streamlit Admin Dashboard")

# 1. Tiers and Businesses
st.header("Business Accounts & Tiers")
try:
    conn = get_db_connection()
    df_businesses = pd.read_sql_query("SELECT id, name, owner_id, status, tier FROM businesses", conn)
    st.dataframe(df_businesses)
except Exception as e:
    st.error(f"Error loading businesses: {e}")

# 2. Add some quick stats
col1, col2, col3 = st.columns(3)
with col1:
    try:
        df_invoices = pd.read_sql_query("SELECT COUNT(*) as count FROM invoices", conn)
        st.metric("Total Invoices", df_invoices['count'][0])
    except:
        st.metric("Total Invoices", "Error")

with col2:
    try:
        df_customers = pd.read_sql_query("SELECT COUNT(*) as count FROM customers", conn)
        st.metric("Total Customers", df_customers['count'][0])
    except:
        st.metric("Total Customers", "Error")

with col3:
    try:
        df_products = pd.read_sql_query("SELECT COUNT(*) as count FROM products", conn)
        st.metric("Total Products", df_products['count'][0])
    except:
         st.metric("Total Products", "Error")


# 3. Simulate specific Tier Views
st.header("Simulate Tier Restrictions")
simulated_tier = st.radio("Select a Tier to simulate view capabilities:", ["Top", "Mid", "Base"])

st.subheader("Products (Inventory)")
if simulated_tier in ["Top", "Mid"]:
    try:
        df_products = pd.read_sql_query("SELECT id, name, price, stock, category FROM products LIMIT 10", conn)
        st.dataframe(df_products)
    except Exception as e:
         st.error(f"Error loading products: {e}")
else:
    st.warning("Products/Inventory access requires Mid or Top tier.")

st.subheader("Mass WhatsApp Campaigns")
if simulated_tier == "Top":
    st.info("Top Tier Access: You have full access to create mass WhatsApp campaigns.")
    # Show dummy campaign data since we don't have a campaigns table yet
    campaigns = pd.DataFrame([
        {"id": 1, "name": "Summer Sale Promo", "status": "Sent", "recipients": 150},
        {"id": 2, "name": "New Product Launch", "status": "Draft", "recipients": 0}
    ])
    st.dataframe(campaigns)
else:
    st.warning("Mass Campaigns access requires Top tier.")

conn.close()
