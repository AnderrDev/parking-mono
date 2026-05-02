"""URLs y namespaces de los WS de DIAN."""

# Habilitación / pruebas
WSDL_SANDBOX = "https://vpruebas.dian.gov.co/WcfDianCustomerService.svc?wsdl"
ENDPOINT_SANDBOX = "https://vpruebas.dian.gov.co/WcfDianCustomerService.svc"

# Producción
WSDL_PROD = "https://vpfe.dian.gov.co/WcfDianCustomerService.svc?wsdl"
ENDPOINT_PROD = "https://vpfe.dian.gov.co/WcfDianCustomerService.svc"

# Namespaces SOAP / WS-Security / DIAN
NS_SOAP = "http://schemas.xmlsoap.org/soap/envelope/"
NS_WSSE = (
    "http://docs.oasis-open.org/wss/2004/01/"
    "oasis-200401-wss-wssecurity-secext-1.0.xsd"
)
NS_WSU = (
    "http://docs.oasis-open.org/wss/2004/01/"
    "oasis-200401-wss-wssecurity-utility-1.0.xsd"
)
NS_WCF = "http://www.dian.gov.co/contratos/facturaelectronica/v1"
NS_WCO = "http://schemas.datacontract.org/2004/07/DianResponse"

PASSWORD_TYPE_TEXT = (
    "http://docs.oasis-open.org/wss/2004/01/"
    "oasis-200401-wss-username-token-profile-1.0#PasswordText"
)

SOAP_ACTION_SEND_BILL = (
    "http://wcf.dian.colombia/IWcfDianCustomerServices/SendBillSync"
)
SOAP_ACTION_GET_STATUS = (
    "http://wcf.dian.colombia/IWcfDianCustomerServices/GetStatus"
)
