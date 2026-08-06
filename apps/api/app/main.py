from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.db import Base, SessionLocal, engine
from app.routers import (
    auth,
    book,
    bookings,
    conversations,
    customers,
    dashboard,
    edge,
    flows,
    grab,
    line,
    orders,
    payments,
    pos,
    reports,
    resources,
    services,
    tickets,
    vendors,
    whatsapp,
    workspace,
)
from app.schema_migrate import ensure_schema
from app.seed import bootstrap


@asynccontextmanager
async def lifespan(_: FastAPI):
    Base.metadata.create_all(bind=engine)
    ensure_schema()
    db = SessionLocal()
    try:
        bootstrap(db)
    finally:
        db.close()
    yield


app = FastAPI(title=settings.app_name, lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/v1")
app.include_router(dashboard.router, prefix="/v1")
app.include_router(reports.router, prefix="/v1")
app.include_router(vendors.router, prefix="/v1")
app.include_router(edge.router, prefix="/v1")
app.include_router(services.router, prefix="/v1")
app.include_router(resources.router, prefix="/v1")
app.include_router(customers.router, prefix="/v1")
app.include_router(bookings.router, prefix="/v1")
app.include_router(pos.router, prefix="/v1")
app.include_router(tickets.router, prefix="/v1")
app.include_router(orders.router, prefix="/v1")
app.include_router(grab.router, prefix="/v1")
app.include_router(line.router, prefix="/v1")
app.include_router(workspace.router, prefix="/v1")
app.include_router(conversations.router, prefix="/v1")
app.include_router(whatsapp.router, prefix="/v1")
app.include_router(flows.router)
# Hosted booking + checkout (not under /v1) — legacy fallback; primary UX is WhatsApp Flows
app.include_router(book.router)
app.include_router(payments.router)


@app.get("/health")
def health() -> dict:
    return {"ok": True, "service": "baseapp-api", "env": settings.environment}
