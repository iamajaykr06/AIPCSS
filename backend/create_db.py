from app import create_app, db
from app.models import *

app = create_app('development')
with app.app_context():
    print("Creating tables...")
    db.create_all()
    print("Tables created successfully including workload_allocations.")
