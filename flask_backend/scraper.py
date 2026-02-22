import requests
from bs4 import BeautifulSoup
import re


def fetch_job_listing(url):
    """
    Fetch and extract text content from a job listing URL
    
    Args:
        url (str): The URL of the job listing
        
    Returns:
        dict: Contains 'text' and 'title' if successful, 'error' if failed
    """
    try:
        # Set headers to mimic a browser
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
        
        # Fetch the page
        response = requests.get(url, headers=headers, timeout=10)
        response.raise_for_status()
        
        # Parse HTML
        soup = BeautifulSoup(response.content, 'html.parser')
        
        # Remove script and style elements
        for element in soup(['script', 'style', 'nav', 'footer', 'header']):
            element.decompose()
        
        # Try to find job title
        title = None
        title_tags = soup.find_all(['h1', 'h2'])
        if title_tags:
            title = title_tags[0].get_text(strip=True)
        
        # Extract text content
        text = soup.get_text(separator=' ', strip=True)
        
        # Clean up text
        text = re.sub(r'\s+', ' ', text)  # Remove extra whitespace
        text = text.strip()
        
        if len(text) < 50:
            return {
                'error': 'Could not extract sufficient content from the URL',
                'status': 'insufficient_content'
            }
        
        return {
            'text': text,
            'title': title or 'Unknown',
            'url': url,
            'status': 'success'
        }
    
    except requests.exceptions.Timeout:
        return {
            'error': 'Request timed out. The website took too long to respond.',
            'status': 'timeout'
        }
    
    except requests.exceptions.ConnectionError:
        return {
            'error': 'Could not connect to the website. Please check the URL.',
            'status': 'connection_error'
        }
    
    except requests.exceptions.HTTPError as e:
        return {
            'error': f'HTTP error occurred: {e.response.status_code}',
            'status': 'http_error'
        }
    
    except Exception as e:
        return {
            'error': f'Failed to fetch job listing: {str(e)}',
            'status': 'error'
        }


# Test function
if __name__ == '__main__':
    # Test with a sample URL
    test_url = input("Enter a job listing URL to test: ")
    result = fetch_job_listing(test_url)
    
    if 'error' in result:
        print(f"\n❌ Error: {result['error']}")
    else:
        print(f"\n✅ Successfully fetched job listing!")
        print(f"Title: {result['title']}")
        print(f"Text length: {len(result['text'])} characters")
        print(f"\nFirst 200 characters:\n{result['text'][:200]}...")