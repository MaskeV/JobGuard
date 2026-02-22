from flask import Flask, request, jsonify
from flask_cors import CORS
import joblib
import pandas as pd
import re
from scipy.sparse import hstack
import os
from scraper import fetch_job_listing

app = Flask(__name__)
CORS(app)  # Allow React frontend to connect

# Load trained model and preprocessors
MODEL_DIR = os.path.join(os.path.dirname(__file__), 'models')

print("Loading model files...")
model = joblib.load(os.path.join(MODEL_DIR, 'xgboost_model.pkl'))
tfidf = joblib.load(os.path.join(MODEL_DIR, 'tfidf_vectorizer.pkl'))
feature_cols = joblib.load(os.path.join(MODEL_DIR, 'feature_columns.pkl'))
print("✅ Model loaded successfully!")


feature_cols = joblib.load(os.path.join(MODEL_DIR, 'feature_columns.pkl'))
print("✅ Model loaded successfully!")
print(f"\n🔍 Feature order expected by model:")
print(feature_cols)

def extract_features_from_text(text):
    """Extract features from job listing text"""
    features = {}
    
    text_lower = text.lower()
    
    # Red flag keywords
    urgency_words = ['urgent', 'immediate', 'asap', 'hurry', 'limited time', 'act now', 'apply now']
    money_words = ['pay', 'fee', 'invest', 'purchase', 'buy', 'payment required', 'deposit']
    too_good_words = ['easy money', 'no experience', 'guaranteed income', 'unlimited', 'get rich']
    
    features['urgency_count'] = sum(word in text_lower for word in urgency_words)
    features['money_request_count'] = sum(word in text_lower for word in money_words)
    features['too_good_count'] = sum(word in text_lower for word in too_good_words)
    
    # Text length features
    features['text_length'] = len(text)
    features['word_count'] = len(text.split())
    
    # Exclamation marks (often overused in scams)
    features['exclamation_count'] = text.count('!')
    
    # Binary features - set to 0 for web-scraped content (we don't have this info)
    features['has_logo'] = 0
    features['has_questions'] = 0
    features['has_employment_type'] = 0
    features['has_required_experience'] = 0
    features['has_required_education'] = 0
    features['has_industry'] = 0
    features['has_function'] = 0
    
    return features


def analyze_job_listing(text):
    """Analyze a job listing and return fraud prediction"""
    
    # Extract features
    features_dict = extract_features_from_text(text)
    
    # Convert to DataFrame to maintain feature order
    features_df = pd.DataFrame([features_dict])
    features_array = features_df[feature_cols].values
    
    # Create TF-IDF features
    tfidf_features = tfidf.transform([text])
    
    # Combine features
    combined_features = hstack([tfidf_features, features_array.astype('float64')])
    
    # Make prediction
    prediction = model.predict(combined_features)[0]
    probabilities = model.predict_proba(combined_features)[0]
    
    # Determine verdict
    fraud_prob = probabilities[1]
    
    if fraud_prob < 0.3:
        verdict = "legitimate"
        risk_level = "low"
    elif fraud_prob < 0.7:
        verdict = "suspicious"
        risk_level = "medium"
    else:
        verdict = "likely_fraud"
        risk_level = "high"
    
    # Identify red flags
    red_flags = []
    positive_signals = []
    
    if features_dict['urgency_count'] > 2:
        red_flags.append(f"Excessive urgency language detected ({features_dict['urgency_count']} instances)")
    
    if features_dict['money_request_count'] > 3:
        red_flags.append(f"Multiple mentions of payment/fees ({features_dict['money_request_count']} instances)")
    
    if features_dict['too_good_count'] > 0:
        red_flags.append("Unrealistic promises detected (e.g., 'easy money', 'guaranteed income')")
    
    if features_dict['exclamation_count'] > 5:
        red_flags.append(f"Excessive punctuation ({features_dict['exclamation_count']} exclamation marks)")
    
    if features_dict['word_count'] < 50:
        red_flags.append("Very short job description (lacks detail)")
    
    # Check for email patterns
    personal_email_pattern = r'@(gmail|yahoo|hotmail|outlook|aol)\.com'
    if re.search(personal_email_pattern, text.lower()):
        red_flags.append("Personal email address used instead of company domain")
    
    # Positive signals
    if features_dict['word_count'] > 200:
        positive_signals.append("Detailed job description provided")
    
    if features_dict['urgency_count'] == 0:
        positive_signals.append("No pressure tactics or urgency language")
    
    if features_dict['money_request_count'] == 0:
        positive_signals.append("No requests for upfront payments")
    
    # Generate recommendation
    if verdict == "legitimate":
        recommendation = "This job listing appears legitimate. However, always verify the company independently and never provide sensitive information upfront."
    elif verdict == "suspicious":
        recommendation = "This job listing shows some warning signs. Research the company thoroughly, verify contact information, and be cautious about sharing personal details."
    else:
        recommendation = "This job listing shows multiple red flags of a potential scam. Do not apply, do not provide personal information, and do not send any money."
    
    # Generate summary
    if verdict == "likely_fraud":
        summary = f"This listing exhibits {len(red_flags)} major red flags typical of employment scams. The language patterns and structure strongly suggest fraudulent intent."
    elif verdict == "suspicious":
        summary = f"This listing contains {len(red_flags)} warning signs that warrant caution. While it may be legitimate, several aspects raise concerns about authenticity."
    else:
        summary = f"This listing appears legitimate with {len(positive_signals)} positive indicators and minimal red flags. The content and structure are consistent with genuine job postings."
    
    return {
        "verdict": verdict,
        "confidence": int(max(probabilities) * 100),
        "redFlags": red_flags,
        "positiveSignals": positive_signals,
        "riskLevel": risk_level,
        "recommendation": recommendation,
        "companyName": "unknown",  # Would need NER to extract this
        "summary": summary,
        "fraudProbability": round(fraud_prob * 100, 1)
    }


@app.route('/api/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({"status": "ok", "message": "Job detector API is running"})


@app.route('/api/analyze', methods=['POST'])
def analyze():
    """Analyze a job listing from URL or direct text"""
    try:
        data = request.json
        
        if not data:
            return jsonify({"error": "No data provided"}), 400
        
        # Check if URL or text is provided
        if 'url' in data and data['url']:
            # Fetch content from URL
            print(f"Fetching job listing from: {data['url']}")
            fetch_result = fetch_job_listing(data['url'])
            
            if 'error' in fetch_result:
                return jsonify({
                    "error": fetch_result['error'],
                    "status": fetch_result['status']
                }), 400
            
            text = fetch_result['text']
            
        elif 'text' in data and data['text']:
            text = data['text']
            
        else:
            return jsonify({"error": "No URL or text provided"}), 400
        
        if len(text.strip()) < 20:
            return jsonify({"error": "Text too short to analyze"}), 400
        
        # Analyze the job listing
        result = analyze_job_listing(text)
        
        return jsonify(result)
    
    except Exception as e:
        print(f"Error during analysis: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": "Analysis failed", "details": str(e)}), 500
    
    
@app.route('/api/test', methods=['POST'])
def test():
    """Test endpoint with hardcoded text"""
    test_text = """
    URGENT HIRING! Data Entry Specialist needed ASAP!
    
    Earn $8,500 - $12,000 per month working from home!
    No experience needed! Simple copy and paste work.
    
    Requirements:
    - Must pay $99 background check fee
    - Must have valid checking account
    
    Apply now: hiring.manager@gmail.com
    """
    
    result = analyze_job_listing(test_text)
    return jsonify(result)


if __name__ == '__main__':
    print("\n" + "="*50)
    print("🚀 Job Listing Detector API Starting...")
    print("="*50)
    print("API running on: http://localhost:5000")
    print("Health check: http://localhost:5000/api/health")
    print("Analyze endpoint: http://localhost:5000/api/analyze")
    print("  - POST with 'url': Analyze from URL")
    print("  - POST with 'text': Analyze direct text")
    print("="*50 + "\n")
    
    app.run(debug=True, port=5000)