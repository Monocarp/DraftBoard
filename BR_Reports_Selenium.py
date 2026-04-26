import undetected_chromedriver as uc
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
import pandas as pd
import time
import random
import re
from datetime import date


def setup_driver():
    """Initialize undetected Chrome driver"""
    try:
        options = uc.ChromeOptions()
        options.add_argument('--start-maximized')
        options.add_argument('--no-sandbox')
        options.add_argument('--disable-dev-shm-usage')
        
        driver = uc.Chrome(options=options, use_subprocess=True)
        print("✓ Chrome driver initialized successfully")
        return driver
    except Exception as e:
        print(f"✗ CRITICAL ERROR: Failed to initialize Chrome driver")
        print(f"  Error details: {e}")
        raise


def scrape_report(driver, report_url):
    """Scrape individual BR scouting report"""
    print(f"  Scraping report: {report_url}")
    
    try:
        driver.set_page_load_timeout(30)
        driver.get(report_url)
        print(f"    ⏳ Waiting 10 seconds for popups/content to load...")
        time.sleep(10)  # Give more time for dynamic content
        
        # Scroll to load all content
        driver.execute_script("window.scrollTo(0, document.body.scrollHeight);")
        time.sleep(2)
        driver.execute_script("window.scrollTo(0, 0);")
        time.sleep(1)
        
    except Exception as e:
        print(f"    ✗ ERROR: Failed to load report page")
        print(f"      Error details: {e}")
        return None, None, None, None, None, None
    
    summary = None
    strengths = None
    weaknesses = None
    grade = None
    round_proj = None
    pro_comparison = None
    
    try:
        # Debug: Check what headings exist on the page
        try:
            all_h2 = driver.find_elements(By.TAG_NAME, 'h2')
            print(f"    Found {len(all_h2)} h2 headings on page:")
            for h2 in all_h2[:10]:  # Show first 10
                print(f"      - {h2.text[:50]}")
        except:
            pass
        
        # Extract Summary - paragraphs before "Where He Wins" heading
        try:
            # Find all paragraphs with the article text class
            all_paras = driver.find_elements(By.CSS_SELECTOR, 'p.MuiTypography-root')
            summary_parts = []
            
            # Collect paragraphs until we hit a heading
            for para in all_paras:
                text = para.text.strip()
                # Stop if we hit section headings
                if any(heading in text for heading in ['Where He Wins', 'Areas of Improvement', 'Grade, Rank', 'Strengths', 'Weaknesses']):
                    break
                # Skip author bios and very short paragraphs
                if len(text) > 50 and 'has covered' not in text and 'RGR Football' not in text:
                    summary_parts.append(text)
                    if len(summary_parts) >= 3:  # Usually 2-3 intro paragraphs
                        break
            
            if summary_parts:
                summary = '\n\n'.join(summary_parts)
        except Exception as e:
            print(f"      ⚠️  Could not extract Summary: {e}")
        
        # Extract Strengths - under "Where He Wins" heading
        try:
            # Find the "Where He Wins" heading
            heading = driver.find_element(By.XPATH, "//h2[contains(text(), 'Where He Wins')]")
            
            # Get parent container and find all paragraphs in that slide
            parent_slide = heading.find_element(By.XPATH, "./ancestor::div[contains(@id, 'id/article/slide')]")
            strength_paras = parent_slide.find_elements(By.CSS_SELECTOR, 'p.MuiTypography-root')
            
            strength_list = []
            for para in strength_paras:
                text = para.text.strip()
                if (text.startswith('-') or text.startswith('—')) and len(text) > 10:
                    strength_list.append(text)
            
            if strength_list:
                strengths = '\n\n'.join(strength_list)
        except Exception as e:
            print(f"      ⚠️  Could not extract Strengths: {e}")
        
        # Extract Weaknesses - under "Areas of Improvement" heading
        try:
            # Find the "Areas of Improvement" heading
            heading = driver.find_element(By.XPATH, "//h2[contains(text(), 'Areas of Improvement')]")
            
            # Get parent container and find all paragraphs in that slide
            parent_slide = heading.find_element(By.XPATH, "./ancestor::div[contains(@id, 'id/article/slide')]")
            weakness_paras = parent_slide.find_elements(By.CSS_SELECTOR, 'p.MuiTypography-root')
            
            weakness_list = []
            for para in weakness_paras:
                text = para.text.strip()
                if (text.startswith('-') or text.startswith('—')) and len(text) > 10:
                    weakness_list.append(text)
            
            if weakness_list:
                weaknesses = '\n\n'.join(weakness_list)
        except Exception as e:
            print(f"      ⚠️  Could not extract Weaknesses: {e}")
        
        # Extract Grade, Round, and Pro Comparison from "Grade, Rank, and Pro Comparison" section
        try:
            # Find the heading (note: includes comma before 'and')
            heading = driver.find_element(By.XPATH, "//h2[contains(text(), 'Grade, Rank')]")
            
            # Get parent container
            parent_slide = heading.find_element(By.XPATH, "./ancestor::div[contains(@id, 'id/article/slide')]")
            grade_paras = parent_slide.find_elements(By.CSS_SELECTOR, 'p.MuiTypography-root')
            
            for para in grade_paras:
                text = para.text.strip()
                
                # Extract Grade - "GRADE: 8.5 (Impact Player - 1st Round)"
                if text.startswith('GRADE:'):
                    grade_match = re.search(r'GRADE:\s*([0-9.]+)', text)
                    if grade_match:
                        grade = grade_match.group(1)
                    
                    # Extract Round from grade line
                    round_match = re.search(r'(\d+(?:st|nd|rd|th)\s*Round)', text, re.IGNORECASE)
                    if round_match:
                        round_proj = round_match.group(1)
                
                # Extract Pro Comparison - "PRO COMPARISON: Quinyon Mitchell"
                if text.startswith('PRO COMPARISON:'):
                    comp_match = re.search(r'PRO COMPARISON:\s*(.+)', text)
                    if comp_match:
                        pro_comparison = comp_match.group(1).strip()
        except Exception as e:
            print(f"      ⚠️  Could not extract Grade/Round/Comparison: {e}")
        
        print(f"    ✓ Extracted: Summary={'✓' if summary else '✗'}, Strengths={'✓' if strengths else '✗'}, Weaknesses={'✓' if weaknesses else '✗'}, Grade={'✓' if grade else '✗'}, Round={'✓' if round_proj else '✗'}, Comparison={'✓' if pro_comparison else '✗'}")
        return summary, strengths, weaknesses, grade, round_proj, pro_comparison
        
    except Exception as e:
        print(f"    ✗ ERROR: Failed to extract report data")
        print(f"      Error details: {e}")
        return None, None, None, None, None, None


def main():
    # Load the CSV file — find the most recent BR_Rank_*.csv
    import glob, os
    try:
        csv_files = sorted(glob.glob('BR_Rank*.csv'))
        # Prefer dated files over the complete ones (avoid re-processing)
        rank_files = [f for f in csv_files if 'Complete' not in f]
        if not rank_files:
            rank_files = csv_files
        if not rank_files:
            raise FileNotFoundError('No BR_Rank_*.csv files found')
        input_file = rank_files[-1]  # most recent by name sort
        df = pd.read_csv(input_file)
        print(f"✓ Loaded {input_file} with {len(df)} players")
    except Exception as e:
        print(f"✗ ERROR: Could not load BR_Rank CSV")
        print(f"  Error details: {e}")
        print(f"  Make sure a BR_Rank_<date>.csv file exists in the current directory")
        return
    
    # Add new columns if they don't exist
    if 'Summary' not in df.columns:
        df['Summary'] = None
    if 'Strengths' not in df.columns:
        df['Strengths'] = None
    if 'Weaknesses' not in df.columns:
        df['Weaknesses'] = None
    if 'Grade' not in df.columns:
        df['Grade'] = None
    if 'Round' not in df.columns:
        df['Round'] = None
    if 'Pro Comparison' not in df.columns:
        df['Pro Comparison'] = None
    
    driver = setup_driver()
    
    try:
        print("\n" + "="*60)
        print("BLEACHER REPORT - SCOUTING REPORTS SCRAPER")
        print("="*60)
        
        # Counter for reports scraped
        reports_scraped = 0
        reports_skipped = 0
        
        total_players = len(df)
        
        # Iterate through each row
        for idx, row in df.iterrows():
            report_url = row.get('URL')
            player_name = row.get('Name', f'Player {idx+1}')
            
            # Skip if no report URL
            if pd.isna(report_url) or not report_url:
                print(f"\n[{idx+1}/{total_players}] {player_name}")
                print(f"  ⊘ No report URL - skipping")
                reports_skipped += 1
                continue
            
            print(f"\n[{idx+1}/{total_players}] {player_name}")
            
            # Scrape the report
            summary, strengths, weaknesses, grade, round_proj, pro_comparison = scrape_report(driver, report_url)
            
            # Update the dataframe
            df.at[idx, 'Summary'] = summary
            df.at[idx, 'Strengths'] = strengths
            df.at[idx, 'Weaknesses'] = weaknesses
            df.at[idx, 'Grade'] = grade
            df.at[idx, 'Round'] = round_proj
            df.at[idx, 'Pro Comparison'] = pro_comparison
            
            reports_scraped += 1
            
            # Human-like delay between requests
            if reports_scraped < total_players:
                delay = random.uniform(2, 5)
                time.sleep(delay)
        
        # Save updated CSV
        try:
            # Save with date stamp
            current_date = date.today().strftime("%Y-%m-%d")
            output_file = f"BR_Rank_Complete_{current_date}.csv"
            
            df.to_csv(output_file, index=False, encoding='utf-8-sig')
            
            print("\n" + "="*60)
            print(f"✓ SUCCESS: Data saved to {output_file}")
            print(f"  Reports scraped: {reports_scraped}")
            print(f"  Reports skipped (no URL): {reports_skipped}")
            print("="*60)
            
        except Exception as e:
            print(f"\n✗ ERROR: Failed to save CSV file")
            print(f"  Error details: {e}")
    
    except Exception as e:
        print(f"\n✗ CRITICAL ERROR: Scraping process failed")
        print(f"  Error details: {e}")
    
    finally:
        print("\nClosing browser...")
        driver.quit()
        print("✓ Browser closed")


if __name__ == "__main__":
    main()
