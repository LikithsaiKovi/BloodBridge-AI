"""
ETL Pipeline: Load Dataset.csv → clean → feature engineer → train XGBoost → save model
Run once: python -m etl.pipeline
"""
import os
import sys
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
import logging

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

DATASET_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "Dataset.csv")

BLOOD_GROUP_MAP = {
    "A Positive": "A+", "A Negative": "A-",
    "B Positive": "B+", "B Negative": "B-",
    "O Positive": "O+", "O Negative": "O-",
    "AB Positive": "AB+", "AB Negative": "AB-",
    "A1 Positive": "A+", "A2 Positive": "A+",
    "A1B Positive": "AB+", "A2B Positive": "AB+",
    "A2B Negative": "AB-", "A2 Negative": "A-",
    "Bombay Blood Group": "O-",
    "Do not Know": None,
}


def parse_date(val) -> datetime | None:
    if pd.isna(val) or val == "" or val is None:
        return None
    val = str(val).strip()
    for fmt in ["%Y-%m-%d", "%Y-%m-%d %H:%M:%S.%f", "%Y-%m-%d %H:%M:%S", "%d-%m-%Y"]:
        try:
            return datetime.strptime(val[:len(fmt.replace('%Y','0000').replace('%m','00').replace('%d','00').replace('%H','00').replace('%M','00').replace('%S','00').replace('%f','000000'))], fmt)
        except:
            pass
    try:
        return pd.to_datetime(val).to_pydatetime()
    except:
        return None


def load_and_clean() -> pd.DataFrame:
    logger.info("Loading dataset from %s", DATASET_PATH)
    df = pd.read_csv(DATASET_PATH, low_memory=False)
    logger.info("Raw rows: %d, columns: %d", len(df), len(df.columns))

    # Filter to donor-type rows only
    donor_roles = ["Emergency Donor", "Bridge Donor", "Volunteer"]
    df = df[df["role"].isin(donor_roles)].copy()
    logger.info("Donor rows: %d", len(df))

    # Map blood groups
    df["blood_group_clean"] = df["blood_group"].map(BLOOD_GROUP_MAP)
    df = df[df["blood_group_clean"].notna()].copy()

    # Parse dates
    ref_date = datetime(2025, 8, 1)  # Reference date for feature calculation
    df["last_donation_dt"] = df["last_donation_date"].apply(parse_date)
    df["next_eligible_dt"] = df["next_eligible_date"].apply(parse_date)
    df["last_contacted_dt"] = df["last_contacted_date"].apply(parse_date)

    # Numeric columns
    df["donations_till_date"] = pd.to_numeric(df["donations_till_date"], errors="coerce").fillna(0).astype(int)
    df["total_calls"] = pd.to_numeric(df["total_calls"], errors="coerce").fillna(0).astype(int)
    df["frequency_in_days"] = pd.to_numeric(df["frequency_in_days"], errors="coerce").fillna(90).astype(int)
    df["calls_to_donations_ratio"] = pd.to_numeric(df["calls_to_donations_ratio"], errors="coerce").fillna(0.0)

    # Clean eligibility_status
    df["eligibility_status_clean"] = df["eligibility_status"].apply(
        lambda x: 1 if str(x).strip().lower() == "eligible" else 0
    )

    # Feature: comment score based on NLP keywords in inactive_trigger_comment
    def get_comment_score(val):
        if pd.isna(val) or not val:
            return 1.0
        c_str = str(val).strip().lower()
        if c_str in ("nan", "", "none"):
            return 1.0
        if any(w in c_str for w in ["pregnant", "surgery", "disease", "health", "unwell", "relocated", "medical"]):
            return 0.1
        elif any(w in c_str for w in ["busy", "exam", "travel", "out of station", "fever", "sick"]):
            return 0.4
        elif "temporarily" in c_str:
            return 0.7
        return 1.0

    df["comment_score"] = df["inactive_trigger_comment"].apply(get_comment_score)

    # Feature: days since last donation
    df["days_since_last_donation"] = df["last_donation_dt"].apply(
        lambda d: (ref_date - d).days if d else 365
    )

    # Feature: days until eligible
    df["days_until_eligible"] = df["next_eligible_dt"].apply(
        lambda d: max(0, (d - ref_date).days) if d else 0
    )

    # Feature: donation recency score (higher = donated recently relative to frequency)
    df["recency_score"] = df.apply(
        lambda r: max(0, 1 - (r["days_since_last_donation"] / max(r["frequency_in_days"], 1))),
        axis=1
    )

    # Feature: days since last contacted
    df["days_since_contacted"] = df["last_contacted_dt"].apply(
        lambda d: (ref_date - d).days if d else 999
    )

    # Feature: is active status
    df["is_active"] = df["status"].apply(
        lambda x: 1 if str(x).strip().lower() == "active" else 0
    )

    # Feature: donated before
    df["donated_before"] = df["donated_earlier"].apply(
        lambda x: 1 if str(x).strip().lower() in ["true", "1", "yes"] else 0
    )

    logger.info("Feature engineering complete. Shape: %s", df.shape)
    return df


def build_target(df: pd.DataFrame) -> pd.DataFrame:
    """
    Target: will_donate = 1 if the donor made a bridge donation (has last_bridge_donation_date)
    or is eligible and active with high cdr.
    """
    df["will_donate"] = 0

    # Strong positive signal: has bridge donation date
    mask_bridge = df["last_bridge_donation_date"].notna() & (df["last_bridge_donation_date"] != "")
    df.loc[mask_bridge, "will_donate"] = 1

    # Also positive: eligible, active, high cdr, multiple donations
    mask_high = (
        (df["eligibility_status_clean"] == 1) &
        (df["is_active"] == 1) &
        (df["calls_to_donations_ratio"] >= 0.5) &
        (df["donations_till_date"] >= 2)
    )
    df.loc[mask_high, "will_donate"] = 1

    pos = df["will_donate"].sum()
    total = len(df)
    logger.info("Target distribution: %d positive (%.1f%%), %d negative", pos, 100*pos/total, total-pos)
    return df


FEATURE_COLS = [
    "donations_till_date",
    "frequency_in_days",
    "total_calls",
    "calls_to_donations_ratio",
    "eligibility_status_clean",
    "days_since_last_donation",
    "days_until_eligible",
    "recency_score",
    "days_since_contacted",
    "is_active",
    "donated_before",
    "comment_score",
]


def run_etl() -> pd.DataFrame:
    df = load_and_clean()
    df = build_target(df)
    return df


if __name__ == "__main__":
    df = run_etl()
    logger.info("ETL complete. Final shape: %s", df.shape)
    logger.info("\nSample features:\n%s", df[FEATURE_COLS + ["will_donate"]].head(5).to_string())
