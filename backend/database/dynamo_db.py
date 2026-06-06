import boto3
import json
from decimal import Decimal
from typing import Any, Dict, List, Optional
from config.settings import settings
import logging

logger = logging.getLogger(__name__)

# Primary keys mapping for our tables
TABLE_PKS = {
    "users": "user_id",
    "password_reset_tokens": "token_id",
    "patients": "patient_id",
    "donors": "donor_id",
    "matches": "match_id",
    "predictions": "prediction_id",
    "interactions": "interaction_id",
    "schedules": "schedule_id",
    "system_settings": "setting_id"
}

def get_dynamodb_resource():
    # Helper to get DynamoDB resource
    kwargs = {
        "region_name": settings.aws_region,
    }
    
    # Only pass keys if they aren't the dummy "local" default
    if settings.aws_access_key_id and settings.aws_access_key_id != "local":
        kwargs["aws_access_key_id"] = settings.aws_access_key_id
        kwargs["aws_secret_access_key"] = settings.aws_secret_access_key

    if settings.dynamodb_endpoint and "localhost" in settings.dynamodb_endpoint:
        kwargs["endpoint_url"] = settings.dynamodb_endpoint

    return boto3.resource("dynamodb", **kwargs)

def init_dynamodb():
    """Create tables if they don't exist"""
    dynamodb = get_dynamodb_resource()
    existing_tables = [t.name for t in dynamodb.tables.all()]
    
    for table_name, pk_name in TABLE_PKS.items():
        if table_name not in existing_tables:
            logger.info(f"Creating DynamoDB table: {table_name}")
            try:
                table = dynamodb.create_table(
                    TableName=table_name,
                    KeySchema=[{'AttributeName': pk_name, 'KeyType': 'HASH'}],
                    AttributeDefinitions=[{'AttributeName': pk_name, 'AttributeType': 'S'}],
                    BillingMode='PAY_PER_REQUEST'
                )
                table.wait_until_exists()
                logger.info(f"Created table {table_name}")
            except Exception as e:
                logger.error(f"Error creating table {table_name}: {e}")

# DynamoDB doesn't like floats, it requires Decimal. We need to convert back and forth.
def _float_to_decimal(obj):
    if isinstance(obj, float):
        return Decimal(str(obj))
    elif isinstance(obj, dict):
        return {k: _float_to_decimal(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [_float_to_decimal(v) for v in obj]
    return obj

def _decimal_to_float(obj):
    if isinstance(obj, Decimal):
        if obj % 1 == 0:
            return int(obj)
        return float(obj)
    elif isinstance(obj, dict):
        return {k: _decimal_to_float(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [_decimal_to_float(v) for v in obj]
    return obj

class DynamoRepository:
    def __init__(self, table_name: str):
        self.table_name = table_name
        self.pk_name = TABLE_PKS.get(table_name, "id")
        self.dynamodb = get_dynamodb_resource()
        self.table = self.dynamodb.Table(self.table_name)

    def get_all(self, filters: Dict = None, limit: int = 500) -> List[Dict]:
        try:
            if not filters:
                response = self.table.scan(Limit=limit)
                return _decimal_to_float(response.get('Items', []))
            
            # Simple fallback for filters: scan all and filter in memory
            # For hackathon scale, this is fine. For production, use GSIs!
            response = self.table.scan()
            items = _decimal_to_float(response.get('Items', []))
            
            filtered = []
            for item in items:
                match = True
                for k, v in filters.items():
                    if item.get(k) != v:
                        match = False
                        break
                if match:
                    filtered.append(item)
            return filtered[:limit]
        except Exception as e:
            logger.error(f"DynamoDB get_all error on {self.table_name}: {e}")
            return []

    def get_by_id(self, pk_name: str, pk_value: str) -> Optional[Dict]:
        try:
            response = self.table.get_item(Key={self.pk_name: pk_value})
            item = response.get('Item')
            return _decimal_to_float(item) if item else None
        except Exception as e:
            logger.error(f"DynamoDB get_by_id error on {self.table_name}: {e}")
            return None

    def put(self, data: Dict) -> Dict:
        from datetime import datetime
        now = datetime.utcnow().isoformat() + "Z"
        data["updated_at"] = now
        if "created_at" not in data or not data.get("created_at"):
            data["created_at"] = now
            
        try:
            dynamo_data = _float_to_decimal(data)
            self.table.put_item(Item=dynamo_data)
            return data
        except Exception as e:
            logger.error(f"DynamoDB put error on {self.table_name}: {e}")
            return data

    def update(self, pk_name: str, pk_value: str, updates: Dict) -> Optional[Dict]:
        from datetime import datetime
        updates["updated_at"] = datetime.utcnow().isoformat() + "Z"
        
        update_expr = "SET "
        expr_attr_values = {}
        expr_attr_names = {}
        
        for i, (k, v) in enumerate(updates.items()):
            update_expr += f"#k{i} = :v{i}, "
            expr_attr_names[f"#k{i}"] = k
            expr_attr_values[f":v{i}"] = _float_to_decimal(v)
            
        update_expr = update_expr.rstrip(", ")
        
        try:
            self.table.update_item(
                Key={self.pk_name: pk_value},
                UpdateExpression=update_expr,
                ExpressionAttributeNames=expr_attr_names,
                ExpressionAttributeValues=expr_attr_values
            )
            return self.get_by_id(pk_name, pk_value)
        except Exception as e:
            logger.error(f"DynamoDB update error on {self.table_name}: {e}")
            return None

    def delete(self, pk_name: str, pk_value: str) -> bool:
        try:
            self.table.delete_item(Key={self.pk_name: pk_value})
            return True
        except Exception:
            return False

    def search(self, column: str, query: str, limit: int = 50) -> List[Dict]:
        # Simple scan fallback for search
        try:
            response = self.table.scan()
            items = _decimal_to_float(response.get('Items', []))
            query = str(query).lower()
            filtered = [item for item in items if query in str(item.get(column, "")).lower()]
            return filtered[:limit]
        except Exception as e:
            logger.error(f"DynamoDB search error on {self.table_name}: {e}")
            return []

    def count(self, filters: Dict = None) -> int:
        return len(self.get_all(filters, limit=100000))

    def raw_query(self, sql: str, params: list = None) -> List[Dict]:
        """Convert SQLite raw queries to DynamoDB scans where possible"""
        sql = sql.upper()
        if "FROM USERS" in sql and "EMAIL=?" in sql:
            # Emulate the email lookup
            return self.get_all({"email": params[0]}) if params else []
        elif "FROM PASSWORD_RESET_TOKENS" in sql and "TOKEN_ID=?" in sql:
            return self.get_all({"token_id": params[0]}) if params else []
            
        logger.warning(f"Unsupported raw_query in DynamoDB: {sql}")
        return []
