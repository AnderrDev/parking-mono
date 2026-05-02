from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # DIAN
    dian_nit_emisor: str = "000000000"
    dian_clave_tecnica: str = ""
    dian_wsdl_url: str = "https://vpruebas.dian.gov.co/WcfDianCustomerService.svc?wsdl"
    dian_endpoint: str = "https://vpruebas.dian.gov.co/WcfDianCustomerService.svc"
    dian_timeout_seconds: int = 30

    # Certificado digital
    cert_path: str = "/secure/cert.p12"
    cert_password: str = ""
    cert_b64: str = ""  # Alternativa base64 para Fly.io secrets

    # Supabase
    supabase_url: str = ""
    supabase_api_key: str = ""  # service_role key

    # Storage
    storage_bucket: str = "invoices"
    storage_path: str = "/year/month/"

    # API
    api_port: int = 8000
    api_debug: bool = False

    # Datos del emisor (parqueadero)
    supplier_legal_name: str = "Parqueadero S.A.S."
    supplier_trade_name: str = ""
    supplier_dv: str = "0"
    supplier_address_line: str = ""
    supplier_municipality_code: str = "11001"
    supplier_department_code: str = "11"
    supplier_email: str = ""

    # Modo DIAN: "real" usa SOAP contra DIAN; "mock" para dev/QA sin habilitación
    dian_mode: str = "mock"  # "mock" | "real"
    profile_execution_id: str = "2"  # 1=producción, 2=pruebas


@lru_cache
def get_settings() -> Settings:
    return Settings()
