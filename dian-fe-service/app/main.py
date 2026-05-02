from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.presentation.routes.health_routes import router as health_router
from app.presentation.routes.invoice_routes import router as invoice_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield


app = FastAPI(
    title="DIAN Facturación Electrónica",
    description="Microservicio de facturación electrónica para parqueadero — Colombia",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Restringir en producción a la URL del Edge Function
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

app.include_router(health_router)
app.include_router(invoice_router)
