from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.db import Base, SessionLocal, engine
from app.routers import auth, bookings, conversations, customers, dashboard, services, whatsapp
from app.seed import bootstrap


@asynccontextmanager
async def lifespan(_: FastAPI):
    Base.metadata.create_all(bind=engine)
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
app.include_router(services.router, prefix="/v1")
app.include_router(customers.router, prefix="/v1")
app.include_router(bookings.router, prefix="/v1")
app.include_router(conversations.router, prefix="/v1")
app.include_router(whatsapp.router, prefix="/v1")


@app.get("/health")
def health() -> dict:
    return {"ok": True, "service": "baseapp-api", "env": settings.environment}
