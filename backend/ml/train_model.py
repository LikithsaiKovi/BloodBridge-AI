"""
Train XGBoost model on Dataset.csv to predict donor availability probability.
Run: python -m ml.train_model
Output: ml/models/donor_model.pkl + ml/models/feature_names.json
"""
import os
import sys
import json
import joblib
import logging
import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from xgboost import XGBClassifier
from sklearn.model_selection import train_test_split, cross_val_score
from sklearn.metrics import roc_auc_score, classification_report, accuracy_score
from sklearn.preprocessing import StandardScaler
from etl.pipeline import run_etl, FEATURE_COLS

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

MODEL_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "models")
MODEL_PATH = os.path.join(MODEL_DIR, "donor_model.pkl")
SCALER_PATH = os.path.join(MODEL_DIR, "scaler.pkl")
FEATURES_PATH = os.path.join(MODEL_DIR, "feature_names.json")


def train():
    os.makedirs(MODEL_DIR, exist_ok=True)

    logger.info("Running ETL pipeline...")
    df = run_etl()

    # Prepare features and target
    X = df[FEATURE_COLS].fillna(0).astype(float)
    y = df["will_donate"].astype(int)

    logger.info("Training XGBoost on %d samples, %d features", len(X), len(FEATURE_COLS))
    logger.info("Positive class ratio: %.2f%%", 100 * y.mean())

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )

    # Scale features
    scaler = StandardScaler()
    X_train_scaled = scaler.fit_transform(X_train)
    X_test_scaled = scaler.transform(X_test)

    # XGBoost model
    model = XGBClassifier(
        n_estimators=300,
        max_depth=6,
        learning_rate=0.05,
        subsample=0.8,
        colsample_bytree=0.8,
        scale_pos_weight=(y == 0).sum() / (y == 1).sum(),  # Handle class imbalance
        random_state=42,
        n_jobs=-1,
        eval_metric="auc",
        early_stopping_rounds=20,
        verbosity=0,
    )

    model.fit(
        X_train_scaled, y_train,
        eval_set=[(X_test_scaled, y_test)],
        verbose=False,
    )

    # Evaluate
    y_pred = model.predict(X_test_scaled)
    y_prob = model.predict_proba(X_test_scaled)[:, 1]

    acc = accuracy_score(y_test, y_pred)
    auc = roc_auc_score(y_test, y_prob)

    logger.info("═══════════════════════════════════")
    logger.info("  Model Performance")
    logger.info("  Accuracy : %.4f", acc)
    logger.info("  ROC-AUC  : %.4f", auc)
    logger.info("═══════════════════════════════════")
    logger.info("\n%s", classification_report(y_test, y_pred))

    # Feature importance
    importance = dict(zip(FEATURE_COLS, model.feature_importances_))
    importance_sorted = sorted(importance.items(), key=lambda x: x[1], reverse=True)
    logger.info("Top features:")
    for feat, imp in importance_sorted[:5]:
        logger.info("  %-35s %.4f", feat, imp)

    # Save model and scaler
    joblib.dump(model, MODEL_PATH)
    joblib.dump(scaler, SCALER_PATH)
    with open(FEATURES_PATH, "w") as f:
        json.dump(FEATURE_COLS, f)

    logger.info("✅ Model saved to %s", MODEL_PATH)
    logger.info("✅ Scaler saved to %s", SCALER_PATH)

    return model, scaler, acc, auc


if __name__ == "__main__":
    train()
