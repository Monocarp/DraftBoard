import undetected_chromedriver as uc
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
import pandas as pd
import time
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


def scrape_br_rankings(driver):
    """Scrape Bleacher Report NFL Draft Big Board"""
    url = "https://bleacherreport.com/articles/25419331-2026-nfl-draft-big-board-br-nfl-scouting-depts-final-rankings"
    
    print(f"\nNavigating to {url}")
    
    try:
        driver.set_page_load_timeout(45)
        driver.get(url)
        print("✓ Page loaded successfully")
        print("\n⏳ Waiting 10 seconds for you to close any popups...")
        time.sleep(10)
        print("✓ Continuing with scrape")
    except Exception as e:
        print(f"✗ ERROR: Failed to load page")
        print(f"  Error details: {e}")
        return []
    
    # Wait for content to load (try article, but don't fail if not found)
    try:
        WebDriverWait(driver, 10).until(
            EC.presence_of_element_located((By.TAG_NAME, 'body'))
        )
        print("✓ Page body detected")
    except Exception as e:
        print(f"⚠️  Warning: Couldn't detect page load: {e}")
        print("  Continuing anyway...")
    
    time.sleep(3)  # Additional wait for dynamic content
    
    # Scroll to load all content
    print("  Scrolling to load all content...")
    try:
        for i in range(5):
            driver.execute_script("window.scrollBy(0, 1500);")
            time.sleep(1)
        driver.execute_script("window.scrollTo(0, 0);")
        time.sleep(2)
        print("  ✓ Scrolling complete")
    except Exception as e:
        print(f"  ⚠️  Scrolling issue: {e}")
    
    # Extract player data
    try:
        players = []
        
        # Save page source for debugging
        print("\n  Saving page source for inspection...")
        with open('BR_debug_source.html', 'w', encoding='utf-8') as f:
            f.write(driver.page_source)
        print("  ✓ Saved to BR_debug_source.html")
        
        # Find the paragraph containing all player entries
        # Based on the HTML, it's in a <p> tag with class containing "MuiTypography" and "bp_small__body__article__medium"
        para_elements = driver.find_elements(By.CSS_SELECTOR, 'p.MuiTypography-root')
        
        print(f"\n  Found {len(para_elements)} paragraph elements")
        print(f"  Checking each paragraph for rankings data...\n")
        
        for idx, para in enumerate(para_elements):
            # Get the inner HTML to preserve link structure
            inner_html = para.get_attribute('innerHTML')
            text_preview = para.text[:100] if para.text else ""
            
            print(f"  Para {idx+1}: Length={len(inner_html)}, Preview: {text_preview}...")
            
            # Skip if too short (not the rankings paragraph)
            if len(inner_html) < 500:
                continue
            
            print(f"\n  ✓ Processing paragraph {idx+1} with {len(inner_html)} characters")
            
            # Split by <br> tags to get individual entries
            entries = inner_html.split('<br>')
            
            print(f"  Found {len(entries)} entries after split\n")
            
            for entry in entries:
                try:
                    entry = entry.strip()
                    if len(entry) < 5:
                        continue
                    
                    # Parse entry format: "Rank. Position Name, School (Grade)"
                    # or "Rank. Position <a>Name</a>, School (Grade)"
                    
                    # Extract rank (number before first period)
                    import re
                    rank_match = re.match(r'^(\d+)\.', entry)
                    if not rank_match:
                        continue
                    
                    rank = rank_match.group(1)
                    
                    # Remove rank from entry
                    entry_after_rank = entry[rank_match.end():].strip()
                    
                    # Extract URL if link exists
                    url_match = re.search(r'href="([^"]+)"', entry_after_rank)
                    player_url = url_match.group(1) if url_match else None
                    
                    # Remove HTML tags to get clean text
                    clean_text = re.sub(r'<[^>]+>', '', entry_after_rank)
                    clean_text = clean_text.replace('&nbsp;', ' ').replace('&amp;', '&').strip()
                    
                    # Parse format: "Position Name, School (Grade)"
                    # Position is first word(s) before the name
                    # Grade is in parentheses at the end
                    
                    # Extract grade
                    grade_match = re.search(r'\(([0-9.]+)\)\s*$', clean_text)
                    grade = grade_match.group(1) if grade_match else None
                    
                    if grade_match:
                        text_without_grade = clean_text[:grade_match.start()].strip()
                    else:
                        text_without_grade = clean_text
                    
                    # Split by comma to separate "Position Name" from "School"
                    if ',' in text_without_grade:
                        before_comma, school = text_without_grade.rsplit(',', 1)
                        school = school.strip()
                    else:
                        before_comma = text_without_grade
                        school = None
                    
                    # Split position and name
                    # Position is typically 1-2 words (S, Edge, CB, IOL, OT, QB, RB, WR, DL, LB, TE)
                    parts = before_comma.split(None, 1)  # Split on first whitespace
                    if len(parts) >= 2:
                        position = parts[0]
                        name = parts[1]
                    elif len(parts) == 1:
                        position = parts[0]
                        name = None
                    else:
                        position = None
                        name = None
                    
                    player_data = {
                        'Rank': rank,
                        'Position': position,
                        'Name': name,
                        'School': school,
                        'Grade': grade,
                        'URL': player_url
                    }
                    
                    players.append(player_data)
                    print(f"  ✓ {rank}. {position} {name} - {school} ({grade})")
                    
                except Exception as e:
                    print(f"    Error parsing entry: {e}")
                    continue
            
            # If we found players in this paragraph, we're done
            if len(players) > 50:  # Should have 100+ players
                break
        
        print(f"\n✓ Extracted {len(players)} player entries")
        return players
        
    except Exception as e:
        print(f"✗ ERROR: Failed to extract player data")
        print(f"  Error details: {e}")
        import traceback
        traceback.print_exc()
        return []


def main():
    driver = setup_driver()
    
    try:
        print("\n" + "="*60)
        print("BLEACHER REPORT - 2026 NFL DRAFT BIG BOARD SCRAPER (FINAL RANKINGS)")
        print("="*60)
        
        # Scrape rankings
        players = scrape_br_rankings(driver)
        
        # Save to CSV
        if players:
            try:
                df = pd.DataFrame(players)
                
                # Generate filename with current date
                current_date = date.today().strftime("%Y-%m-%d")
                output_file = f"BR_Rank_{current_date}.csv"
                
                df.to_csv(output_file, index=False, encoding='utf-8-sig')
                
                print("\n" + "="*60)
                print(f"✓ SUCCESS: Data saved to {output_file}")
                print(f"  Total players: {len(players)}")
                print("="*60)
                
            except Exception as e:
                print(f"\n✗ ERROR: Failed to save CSV file")
                print(f"  Error details: {e}")
        else:
            print("\n⚠️  WARNING: No players were scraped")
    
    except Exception as e:
        print(f"\n✗ CRITICAL ERROR: Scraping process failed")
        print(f"  Error details: {e}")
    
    finally:
        print("\nClosing browser...")
        driver.quit()
        print("✓ Browser closed")


if __name__ == "__main__":
    main()
