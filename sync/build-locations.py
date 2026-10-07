#!/usr/bin/env python3
"""Build crawlable city location pages (hub-and-spoke) in one pass.

Every city gets its own static, self-canonical landing page with its own title,
description, H1, city-specific H2 modules, CTA band, FAQ and JSON-LD
(Service + FAQPage + BreadcrumbList), exactly like /locations/surrey/.

    site/locations/index.html       hub (links to every city)
    site/locations/<city>/index.html
    site/sitemap-locations.xml

Run before every Pages deploy:
    python3 sync/build-locations.py

Generated under site/locations/, which is gitignored: it only exists in
pages-dist after the deploy copy, like the /v/ and /forum/ trees.
"""
import html
import json
import os
import re
import sys
import datetime

SITE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "site")
OUT_DIR = os.path.join(SITE, "locations")
OUT_SITEMAP = os.path.join(SITE, "sitemap-locations.xml")

BASE = "https://dangm.ca"
PHONE = "604-735-1396"
PHONE_HREF = "tel:6047351396"
TODAY = datetime.date.today().isoformat()
CSS_V = "25"
JS_V = "25"


def esc(s):
    return html.escape(str(s or ""), quote=True)


CITIES = [
    {
        "slug": "coquitlam",
        "name": "Coquitlam",
        "h1": "Your Trusted Partner for Bad Credit Auto Financing in Coquitlam, BC",
        "title": "Car Loans & Bad Credit Auto Financing Coquitlam BC | DanGM",
        "desc": "Get approved for a GMC or Chevrolet in Coquitlam, BC. Specialist credit rebuilding & New-to-Canada auto financing programs. Call 604-735-1396.",
        "eyebrow": "SERVING COQUITLAM & THE TRI-CITIES, BC",
        "sub": "Curated, zero-pressure car consulting on home turf at 2595 Barnet Hwy, built for Coquitlam drivers with bad credit, bankruptcy, or no Canadian credit history.",
        "banner": "dan-gm-personal-car-consultant-coquitlam-bc.svg",
        "banner_alt": "dan-gm-personal-car-consultant-coquitlam-bc",
        "intro": [
            "DanGM is based right here in Coquitlam, in partnership with <a href=\"https://eagleridgegm.com\" rel=\"noopener\">Eagle Ridge GM</a> at 2595 Barnet Hwy, so this is home turf. Whether you are up on Westwood Plateau or Burke Mountain, over in Austin Heights, or down in Burquitlam, you are minutes from the lot, and Dan can have a shortlist and your numbers ready before you even drive over. Coquitlam drivers live with the Highway 1 and Lougheed Highway grind every day, which is exactly why the right vehicle and the right monthly payment matter more than the badge on the grille.",
            "Bad credit happens to good Coquitlam people: a layoff at the mill, a divorce, a consumer proposal, or a rough stretch of missed payments. None of it parks your life. Dan works with lending programs built for exactly these situations, and approvals are based on what BC lenders actually care about today, which is stable income, a manageable payment, and a realistic down payment, not a single three-digit score.",
            "Coquitlam is one of the fastest-growing newcomer communities in the Tri-Cities, and no Canadian credit history is a normal starting point here, not a dealbreaker. Dedicated newcomer programs look at your work permit or PR status, your employment letter, and your down payment instead of a credit file that has not had time to exist yet. One call to 604-735-1396 gets you a straight answer about what is possible, usually the same day.",
        ],
        "modules": [
            ("Getting Approved from Coquitlam", [
                "Because the dealership is in your own city, Coquitlam buyers get the smoothest version of the process. You text Dan a photo of your documents, he runs your approval while you carry on with your day, and you only come down to Barnet Hwy once you know the truck or SUV is yours and the payment is locked. No wandering a lot, no being handed off between salespeople, and no surprises when you sit down to sign.",
                "If you are not sure what fits your budget, start with the <a href=\"/inventory.html\">current Eagle Ridge GM inventory</a> and tell Dan which two or three caught your eye. He will run real numbers on each one, factor in your trade if you have one, and tell you honestly which deal makes the most sense for your situation.",
            ]),
            ("Credit Rebuilding through GMC & Chevrolet Inventory", [
                "A car loan is one of the most powerful credit-rebuilding tools a Coquitlam driver has, and the vehicle you choose matters more than most people realize. A dependable used GMC Terrain or Chevrolet Equinox with a sensible payment builds a clean history every month, and twelve to twenty-four months of on-time payments does more for your file than any credit repair product on the market.",
                "Dan steers credit-rebuilding buyers toward well-priced, dependable inventory at Eagle Ridge GM that your lender is comfortable with today and that will still be worth something when you trade up. Ready to start? <a href=\"/#lead\">Apply for financing approval</a> and Dan will call you back personally.",
            ]),
        ],
        "faq": [
            ("Can I get approved for car financing in Coquitlam with bad credit?", "Yes. Dan works with lending programs built for bad credit, no credit, and past bankruptcy. Approval is based on income stability and payment fit, and you get a clear answer before you shop. Call 604-735-1396 to start."),
            ("I filed bankruptcy. Can I still finance a GMC or Chevrolet?", "In many cases, yes. What matters most is where you are in the process, your income today, and choosing a vehicle with a payment that fits. Dan handles post-bankruptcy files regularly and will tell you honestly what is possible."),
            ("I just moved to Canada and have no credit history. What do I need?", "Bring your passport or PR card, your work or study permit, an employment letter, and a valid BC driver's licence. Newcomer programs underwrite the person, not the missing credit file."),
            ("Do I have to visit the dealership to get started?", "No. Shortlists, numbers, and approvals are handled by phone and text. You only come to Eagle Ridge GM on Barnet Hwy once, to pick up your vehicle."),
        ],
    },
    {
        "slug": "port-coquitlam",
        "name": "Port Coquitlam",
        "h1": "Your Trusted Partner for Bad Credit Auto Financing in Port Coquitlam, BC",
        "title": "Car Loans & Bad Credit Auto Financing Port Coquitlam BC | DanGM",
        "desc": "Get approved for a GMC or Chevrolet in Port Coquitlam, BC. Specialist credit rebuilding & New-to-Canada auto financing programs. Call 604-735-1396.",
        "eyebrow": "SERVING PORT COQUITLAM & THE TRI-CITIES, BC",
        "sub": "Curated, zero-pressure car consulting minutes away in Coquitlam, built for Port Coquitlam drivers with bad credit, bankruptcy, or no Canadian credit history.",
        "banner": "gmc-truck-inventory-eagle-ridge-gm-tri-cities.svg",
        "banner_alt": "gmc-truck-inventory-eagle-ridge-gm-tri-cities",
        "intro": [
            "Port Coquitlam is a short run down the Mary Hill Bypass or the Lougheed from Eagle Ridge GM in Coquitlam, which makes DanGM one of the closest truly personal car consultants you will find. Instead of working a commission floor, Dan builds a shortlist for you, the right GMC, Chevrolet, or Buick for your family, your budget, and the drive you actually do, and gives you honest numbers in writing before you set foot on the lot.",
            "Bad credit, a consumer proposal, or a bankruptcy in your past does not end your search in Port Coquitlam. Dan works with lending programs designed for these files, and approval comes down to steady income, a payment you can carry, and a realistic down payment rather than a single score. Whether you are in Birchland Manor, Citadel, or Mary Hill, you get an approval-first conversation so you know exactly what you qualify for before you fall in love with a truck.",
            "Port Coquitlam has a strong new-to-Canada community, and arriving without a Canadian credit file is normal, not disqualifying. Newcomer programs weigh your PR card or work permit, your employment letter, and your down payment instead of a credit history that has not had time to build. One call to 604-735-1396 and Dan tells you straight what is possible, usually the same day.",
        ],
        "modules": [
            ("Port Coquitlam Commuters and the Right Vehicle", [
                "If you are running the West Coast Express or grinding the Mary Hill into Burnaby and Vancouver every morning, the vehicle you choose should match that life. Dan will steer you away from the wrong truck for a 60-kilometre daily commute and toward something that protects your wallet at the pump, whether that is a fuel-efficient crossover or a properly specked pickup for the work truck you actually need.",
                "Tell Dan how you use your vehicle, and he will shortlist from the <a href=\"/inventory.html\">live Eagle Ridge GM inventory</a> with that in mind. Then he runs the numbers so your payment still works after insurance, fuel, and real life.",
            ]),
            ("Credit Rebuilding through GMC & Chevrolet Inventory", [
                "For Port Coquitlam drivers rebuilding after a rough patch, the vehicle is your tool. A sensible used GMC or Chevrolet with a payment you can carry, paid on time month after month, rebuilds your credit faster and more reliably than anything else you can do. Dan matches you to inventory your lender is comfortable with so you can build the history without risking the setback of a deal that only worked on paper.",
                "When you are ready, <a href=\"/#lead\">apply for financing approval</a>, or call 604-735-1396 and ask Dan what your credit story actually qualifies for. It is very often better than you think.",
            ]),
        ],
        "faq": [
            ("Is DanGM actually close to Port Coquitlam?", "Yes. DanGM works out of Eagle Ridge GM at 2595 Barnet Hwy in Coquitlam, a short drive from anywhere in Port Coquitlam, and most of the process is handled by phone and text before you visit once."),
            ("Can I get a car loan in Port Coquitlam with bad credit?", "Yes. Dan uses lending programs built for bad credit, no credit, and past bankruptcy. You get a clear answer before you shop, based on income and payment fit. Call 604-735-1396."),
            ("I am new to Canada with no credit history. Can I still get approved?", "Yes. Newcomer programs look at your permit or PR status, your employment letter, and your down payment rather than a missing credit file. Bring your passport or PR card, your permit, and an employment letter."),
            ("Do you take trade-ins in Port Coquitlam?", "Absolutely. Bring your current vehicle and Dan will work out a fair, transparent value toward your next one. Call 604-735-1396 to talk it through."),
        ],
    },
    {
        "slug": "port-moody",
        "name": "Port Moody",
        "h1": "Your Trusted Partner for Bad Credit Auto Financing in Port Moody, BC",
        "title": "Car Loans & Bad Credit Auto Financing Port Moody BC | DanGM",
        "desc": "Get approved for a GMC or Chevrolet in Port Moody, BC. Specialist credit rebuilding & New-to-Canada auto financing programs. Call 604-735-1396.",
        "eyebrow": "SERVING PORT MOODY & THE TRI-CITIES, BC",
        "sub": "Curated, zero-pressure car consulting next door in Coquitlam, built for Port Moody drivers with bad credit, bankruptcy, or no Canadian credit history.",
        "banner": "zero-pressure-used-car-buying-coquitlam.svg",
        "banner_alt": "zero-pressure-used-car-buying-coquitlam",
        "intro": [
            "Port Moody is right next door to Eagle Ridge GM, which makes DanGM an easy, no-pressure alternative to working a sales floor. From Heritage Woods to Moody Centre and up into Anmore and Belcarra, Port Moody drivers want a straight answer and a fair number, not a runaround. Dan builds your shortlist, gives you honest numbers in writing, and stays with you from the first call to the keys in your hand.",
            "A bankruptcy, a consumer proposal, or a stretch of missed payments does not have to stall your plans in Port Moody. Dan works with lenders who underwrite the person and the payment, not just a credit score, so approval is built around stable income and a realistic down payment. You find out what you qualify for before you go looking at trucks you cannot quite afford.",
            "Port Moody is a magnet for newcomers and young families, and starting in Canada with no credit file is completely normal here. Dedicated newcomer programs weigh your PR card or work permit, your employment letter, and your down payment instead of a file that has not had time to grow. One call to 604-735-1396 and you will know what is possible.",
        ],
        "modules": [
            ("Port Moody Families and the Right SUV", [
                "Port Moody is family country, and the right SUV makes the school run, the Costco trip, and the weekend up to Buntzen a lot easier. Dan will help you weigh a GMC Terrain or Chevrolet Equinox against a larger Yukon or Tahoe based on your actual family size, your parking, and your budget, instead of upselling you into more vehicle than you need.",
                "Browse the <a href=\"/inventory.html\">current Eagle Ridge GM inventory</a> and tell Dan what matters most, and he will narrow it to the two or three that truly fit. Then you get real numbers before you commit.",
            ]),
            ("Credit Rebuilding through GMC & Chevrolet Inventory", [
                "For Port Moody drivers rebuilding credit, the loan itself is the tool. A dependable used GMC or Chevrolet with a manageable payment, paid on time every month, rebuilds your file faster than any repair service. Dan steers you to inventory your lender is comfortable with so the deal holds together and every payment counts.",
                "When you are ready, <a href=\"/#lead\">apply for financing approval</a> or call 604-735-1396 and ask Dan what you qualify for. Honest answers, zero pressure.",
            ]),
        ],
        "faq": [
            ("Can I finance a car in Port Moody with bad credit?", "Yes. Dan works with lending programs for bad credit, no credit, and past bankruptcy, and gives you a clear answer before you shop. Call 604-735-1396."),
            ("Do I need to drive to Coquitlam?", "Only when you want to. Shortlists, numbers, and approvals are handled by phone and text, and the pickup happens once at Eagle Ridge GM in Coquitlam."),
            ("I just moved to Port Moody and have no Canadian credit. Can I get approved?", "Almost certainly. Newcomer programs underwrite your PR or permit status, your employment letter, and your down payment rather than a missing credit file."),
            ("Can I trade in my current vehicle?", "Yes. Dan works out a fair, transparent value and puts it straight toward your next GMC, Chevrolet, or Buick."),
        ],
    },
    {
        "slug": "burnaby",
        "name": "Burnaby",
        "h1": "Your Trusted Partner for Bad Credit Auto Financing in Burnaby, BC",
        "title": "Car Loans & Bad Credit Auto Financing Burnaby BC | DanGM",
        "desc": "Get approved for a GMC or Chevrolet in Burnaby, BC. Specialist credit rebuilding & New-to-Canada auto financing programs. Call 604-735-1396.",
        "eyebrow": "SERVING BURNABY & THE LOWER MAINLAND, BC",
        "sub": "Curated, zero-pressure car consulting from Coquitlam, built for Burnaby drivers with bad credit, bankruptcy, or no Canadian credit history.",
        "banner": "chevrolet-suv-bad-credit-financing-lower-mainland.svg",
        "banner_alt": "chevrolet-suv-bad-credit-financing-lower-mainland",
        "intro": [
            "Burnaby sits right between the Tri-Cities and downtown, and DanGM serves it the same way as anywhere else in the Lower Mainland: one personal consultant, honest numbers in writing, and zero pressure. From Metrotown and Brentwood to Lougheed, Edmonds, and the Heights, Burnaby drivers get a shortlist built for them instead of a tour of whatever the lot needs to move. The dealership is Eagle Ridge GM in Coquitlam, an easy run up the Lougheed or Highway 1.",
            "Bad credit in Burnaby is far more common than anyone admits, and it does not have to stop you. Dan works with lenders who look at steady income, a manageable payment, and a realistic down payment rather than one number. If you are rebuilding after a consumer proposal, a bankruptcy, or a tough year, the process starts with what you qualify for, so you never fall for a vehicle you cannot carry.",
            "Burnaby is one of the most diverse cities in Canada, and landing here with no Canadian credit history is a normal starting point. Newcomer programs consider your PR card or work permit, your employment letter, and your down payment, not the credit file you have not had time to build. One call to 604-735-1396 and Dan tells you exactly what is possible.",
        ],
        "modules": [
            ("Burnaby Commuters: Choosing the Right Vehicle", [
                "Burnaby is a commuter city, and whether you drive to Metrotown, across the Ironworkers to the North Shore, or into downtown, the right vehicle keeps the fuel bill sane and the drive comfortable. Dan helps you match the vehicle to the commute, so you are not paying for capability you never use or living with a truck that drinks fuel in stop-and-go traffic.",
                "Start with the <a href=\"/inventory.html\">live Eagle Ridge GM inventory</a> and tell Dan where you drive and how often, and he will shortlist the two or three that make sense for Burnaby life.",
            ]),
            ("Credit Rebuilding through GMC & Chevrolet Inventory", [
                "For Burnaby buyers, a financed vehicle is one of the fastest paths back to a healthy credit file. A well-chosen used GMC or Chevrolet with a payment you can manage, paid on time for a year or two, does more than any repair product. Dan points you at inventory your lender will accept so the loan closes cleanly and every payment builds your history.",
                "Ready when you are: <a href=\"/#lead\">apply for financing approval</a>, or call 604-735-1396 and ask what your situation qualifies for.",
            ]),
        ],
        "faq": [
            ("Can I get approved for car financing in Burnaby with bad credit?", "Yes. Dan uses lending programs for bad credit, no credit, and past bankruptcy, and gives you a clear answer before you shop. Call 604-735-1396."),
            ("I went through a bankruptcy. Can I still buy a GMC or Chevrolet?", "In many cases, yes. What matters is your income today and a payment that fits. Dan handles post-bankruptcy files regularly and will be honest about what is possible."),
            ("I just arrived in Burnaby with no Canadian credit. What do I need?", "Your passport or PR card, your work or study permit, an employment letter, and a valid BC driver's licence. Newcomer programs underwrite the person, not the missing file."),
            ("How far is the dealership from Burnaby?", "Eagle Ridge GM is in Coquitlam, a short drive up the Lougheed or Highway 1. Most of the process happens by phone and text before one pickup visit."),
        ],
    },
    {
        "slug": "new-westminster",
        "name": "New Westminster",
        "h1": "Your Trusted Partner for Bad Credit Auto Financing in New Westminster, BC",
        "title": "Car Loans & Bad Credit Auto Financing New Westminster BC | DanGM",
        "desc": "Get approved for a GMC or Chevrolet in New Westminster, BC. Specialist credit rebuilding & New-to-Canada auto financing programs. Call 604-735-1396.",
        "eyebrow": "SERVING NEW WESTMINSTER & THE LOWER MAINLAND, BC",
        "sub": "Curated, zero-pressure car consulting from Coquitlam, built for New Westminster drivers with bad credit, bankruptcy, or no Canadian credit history.",
        "banner": "new-to-canada-car-loan-approval-vancouver.svg",
        "banner_alt": "new-to-canada-car-loan-approval-vancouver",
        "intro": [
            "New Westminster and the Tri-Cities are neck and neck on the Highway 1 corridor, so DanGM serves Royal City drivers the same way as anyone else in the Lower Mainland: one personal consultant who knows your budget, honest numbers you can trust, and no pressure from a commission desk. From Sapperton and Queensborough to Sapperton, Uptown, and the Quay, Dan builds the shortlist so you do not have to tour a lot on a hope.",
            "If your credit has taken a hit, whether from a divorce, a consumer proposal, or a bankruptcy, Dan works with lenders who care about where you are now. Approval is built around steady income, a payment you can carry, and a realistic down payment. You find out what you qualify for before you get your heart set on a truck, which is exactly how it should work.",
            "New Westminster welcomes a lot of newcomers, and starting in Canada with no credit file is normal here, not a red flag. Newcomer programs weigh your PR card or work permit, your employment letter, and your down payment instead of a credit history that has not had time to exist. One call to 604-735-1396 and you will know what is possible.",
        ],
        "modules": [
            ("New Westminster Drivers and the Right Fit", [
                "New Westminster is dense, and parking, insurance, and the daily Pattullo and Queensborough crossings all shape what vehicle actually makes sense. Dan helps you match the vehicle to how you really live, city streets and tight parking included, so you are not paying for a truck that is a headache to park and feed.",
                "Tell Dan how and where you drive, then look at the <a href=\"/inventory.html\">current Eagle Ridge GM inventory</a>. He will narrow it down and run the numbers before you commit.",
            ]),
            ("Credit Rebuilding through GMC & Chevrolet Inventory", [
                "For New Westminster buyers, a car loan is a credit-rebuilding engine. A dependable used GMC or Chevrolet with a sensible payment, paid on time month after month, rebuilds your file faster than any service you can buy. Dan matches you to inventory your lender is comfortable with so the deal is solid and every payment sticks.",
                "When you are ready, <a href=\"/#lead\">apply for financing approval</a> or call 604-735-1396 and ask Dan what your credit story qualifies for.",
            ]),
        ],
        "faq": [
            ("Can I get a car loan in New Westminster with bad credit?", "Yes. Dan works with lenders for bad credit, no credit, and past bankruptcy, and gives you a clear answer before you shop. Call 604-735-1396."),
            ("Can I finance after a bankruptcy?", "Often, yes. Dan handles post-bankruptcy files regularly and bases approval on your income today and a payment that fits, not just your history."),
            ("I am new to Canada with no credit history. Can I get approved?", "Yes. Newcomer programs look at your PR or permit status, your employment letter, and your down payment instead of a missing credit file."),
            ("Do you accept trade-ins from New Westminster?", "Yes. Bring your vehicle and Dan works out a fair, transparent value toward your next one. Call 604-735-1396."),
        ],
    },
    {
        "slug": "vancouver",
        "name": "Vancouver",
        "h1": "Your Trusted Partner for Bad Credit Auto Financing in Vancouver, BC",
        "title": "Car Loans & Bad Credit Auto Financing Vancouver BC | DanGM",
        "desc": "Get approved for a GMC or Chevrolet in Vancouver, BC. Specialist credit rebuilding & New-to-Canada auto financing programs. Call 604-735-1396.",
        "eyebrow": "SERVING VANCOUVER & THE LOWER MAINLAND, BC",
        "sub": "Curated, zero-pressure car consulting from Coquitlam, built for Vancouver drivers with bad credit, bankruptcy, or no Canadian credit history.",
        "banner": "new-to-canada-car-loan-approval-vancouver.svg",
        "banner_alt": "new-to-canada-car-loan-approval-vancouver",
        "intro": [
            "Vancouver is one of the biggest new-to-Canada cities in the country, and DanGM serves it with the same personal, zero-pressure approach as the Tri-Cities: one consultant, honest numbers in writing, and no runaround. From Kitsilano and Mount Pleasant to Renfrew, Killarney, Marpole, and the West End, Dan builds a shortlist around your budget and your commute, with the paperwork done once at Eagle Ridge GM in Coquitlam.",
            "Bad credit is common in an expensive city, and it does not have to park your plans. A bankruptcy, a consumer proposal, or a rough patch of missed payments can still end in an approval when the file is built around stable income and a payment you can genuinely carry. Dan works with lenders who underwrite the person, and he tells you honestly what is possible before you shop.",
            "Vancouver thrives on newcomers, and starting here with no Canadian credit history is entirely normal. Dedicated programs look at your PR card or work permit, your employment letter, and your down payment instead of a credit file that has not had time to grow. One call to 604-735-1396 and you will know what you qualify for, usually the same day.",
        ],
        "modules": [
            ("Vancouver Drivers: Parking, Insurance, and the Right Vehicle", [
                "Vancouver is hard on cars and budgets alike, so size, fuel economy, and insurance class matter as much as the badge. Dan helps you pick a vehicle that fits city parking and the insurance reality in BC, whether that is a compact GMC Terrain, a Chevrolet Equinox, or a more capable pickup for weekend work up the Sea to Sky.",
                "Start with the <a href=\"/inventory.html\">live Eagle Ridge GM inventory</a> and tell Dan how you use your vehicle in the city. He will shortlist the two or three that actually fit your life and your payment.",
            ]),
            ("New-to-Canada Car Buying Programs", [
                "If you landed in Vancouver from another country and have no Canadian credit file, you are not starting from zero. Newcomer programs underwrite the person, not the missing score: your PR card or work or study permit, a letter from your employer, your down payment, and proof of address. Dan walks you through every document in plain language and finds lenders who understand landed immigrants and temporary residents.",
                "When you are ready, <a href=\"/#lead\">apply for financing approval</a> and Dan will call you back personally. No Canadian credit is the starting line here, not a wall.",
            ]),
            ("Credit Rebuilding through GMC & Chevrolet Inventory", [
                "For Vancouver buyers rebuilding credit, the loan is the tool. A dependable used GMC or Chevrolet with a manageable payment, paid on time for a year or two, rebuilds your file more reliably than any repair product. Dan steers you toward inventory your lender will accept so the deal closes cleanly and every payment builds your history.",
                "Call 604-735-1396 and ask Dan what your situation qualifies for. Chances are it is better than you think.",
            ]),
        ],
        "faq": [
            ("Can I get approved for car financing in Vancouver with bad credit?", "Yes. Dan works with lending programs for bad credit, no credit, and past bankruptcy, and gives you a clear answer before you shop. Call 604-735-1396."),
            ("I am new to Canada with no credit history. Can I get approved in Vancouver?", "Yes. Newcomer programs underwrite your PR or permit status, your employment letter, and your down payment rather than a missing credit file."),
            ("Can I finance a vehicle after bankruptcy in BC?", "In many cases, yes. Dan handles post-bankruptcy files regularly and bases approval on your income today and a payment that fits."),
            ("Do I have to come to Coquitlam to get started?", "No. Shortlists, numbers, and approvals are handled by phone and text, and the pickup happens once at Eagle Ridge GM in Coquitlam."),
        ],
    },
    {
        "slug": "surrey",
        "name": "Surrey",
        "h1": "Your Trusted Partner for Bad Credit Auto Financing in Surrey, BC",
        "title": "Car Loans & Bad Credit Auto Financing Surrey BC | DanGM",
        "desc": "Get approved for a GMC or Chevrolet in Surrey, BC. Specialist credit rebuilding & New-to-Canada auto financing programs. Call 604-735-1396.",
        "eyebrow": "SERVING SURREY & THE FRASER VALLEY, BC",
        "sub": "Curated, zero-pressure car consulting from Coquitlam, built for Surrey drivers: bad credit, bankruptcy, and no-credit approvals done right.",
        "banner": "chevrolet-suv-bad-credit-financing-lower-mainland.svg",
        "banner_alt": "chevrolet-suv-bad-credit-financing-lower-mainland",
        "intro": [
            "DanGM is a personal car consulting service based in Coquitlam, in partnership with <a href=\"https://eagleridgegm.com\" rel=\"noopener\">Eagle Ridge GM</a>, one of the largest GM dealerships in the Lower Mainland. Instead of sending Surrey residents across the city to wander a lot, Dan builds a shortlist for you: the right GMC, Chevrolet, or Buick for your budget, your family, and your commute along Highway 1, King George Boulevard, or the Port Mann. You get one consultant from the first phone call to the keys in your hand, with honest numbers in writing before you ever visit the dealership.",
            "Bad credit happens to good people in Surrey: a job loss, a divorce, a consumer proposal, a bankruptcy, or a few missed payments during a rough year. None of it has to park your life. Dan works with lending programs designed for these situations, and approval is built around what BC lenders care about today, which is stable income, a manageable payment, and a realistic down payment, not a single three-digit score.",
            "Surrey is one of the fastest-growing new-to-Canada communities in the country, and no Canadian credit history is a normal starting point here, not a dealbreaker. Dedicated newcomer programs look at your work permit or PR status, your employment letter, and your down payment instead of a credit file that has not had time to exist. One call to 604-735-1396 gets you a straight answer about what is possible, usually the same day.",
        ],
        "modules": [
            ("New-to-Canada Car Buying Programs", [
                "If you landed in Surrey from another country and have no Canadian credit file, you are not starting from zero here. Newcomer programs underwrite the person, not the missing score: your PR card or work or study permit, a letter from your employer, your down payment, and proof of where you live. Dan walks Surrey newcomers through every document in plain language and arranges approvals with lenders who actually understand landed immigrants and temporary residents, so a family member is never forced to co-sign just to get you rolling.",
                "Whether you have been in Canada for three weeks or three years, the process is the same short path. You text Dan a photo of your documents, he tells you what you qualify for the same day, and you pick from real GMC, Chevrolet, and Buick inventory. <a href=\"/#lead\">Apply for financing approval</a> and Dan will call you back personally.",
            ]),
            ("Credit Rebuilding through GMC & Chevrolet Inventory", [
                "A car loan is one of the most powerful credit-rebuilding tools available to a Surrey driver, and the vehicle you choose matters more than most people realize. A gently used GMC Terrain or Chevrolet Equinox with a sensible payment builds a clean payment history every month, and twelve to twenty-four months of on-time payments does more for your file than any credit repair service.",
                "Dan steers credit-rebuilding buyers toward dependable, well-priced inventory at Eagle Ridge GM that your lender is comfortable financing today and that will still be worth something when you trade up. When you are ready, <a href=\"/#lead\">apply for financing approval</a>, or call 604-735-1396 and ask Dan what your credit story actually qualifies for.",
            ]),
        ],
        "faq": [
            ("Can I get approved for car financing in Surrey with bad credit?", "Yes. Dan works with lending programs built for bad credit, no credit, and past bankruptcy. Approval is based on income stability and payment fit, and you get a clear answer before you shop. Call 604-735-1396 to start."),
            ("I filed bankruptcy. Can I still finance a GMC or Chevrolet?", "In many cases, yes. What matters most is where you are in the process, your income today, and choosing a vehicle with a payment that fits. Dan handles post-bankruptcy files regularly and will tell you honestly what is possible."),
            ("I just moved to Canada and have no credit history. What do I need?", "Bring your passport or PR card, your work or study permit, an employment letter, and a valid BC driver's licence. Newcomer programs underwrite the person, not the missing credit file."),
            ("Do I have to drive to Coquitlam?", "Only when you want to. Shortlists, numbers, and approvals are handled by phone and text, and test drives can be arranged near you in Surrey. The paperwork happens once at Eagle Ridge GM in Coquitlam."),
        ],
    },
]


def service_jsonld(c):
    return json.dumps({
        "@context": "https://schema.org",
        "@type": "Service",
        "name": f"Bad Credit Auto Financing {c['name']}",
        "serviceType": "Bad credit, bankruptcy, and new-to-Canada car financing",
        "url": f"{BASE}/locations/{c['slug']}/",
        "telephone": PHONE,
        "provider": {
            "@type": "AutoDealer", "@id": f"{BASE}/#business", "name": "DanGM",
            "url": BASE, "telephone": PHONE,
            "address": {"@type": "PostalAddress", "streetAddress": "2595 Barnet Hwy", "addressLocality": "Coquitlam",
                        "addressRegion": "BC", "postalCode": "V3E 1K9", "addressCountry": "CA"},
        },
        "areaServed": [{"@type": "City", "name": c["name"]}, {"@type": "City", "name": "Coquitlam"},
                       {"@type": "City", "name": "Vancouver"}, {"@type": "AdministrativeArea", "name": "Tri-Cities"}],
    }, ensure_ascii=False)


def faq_jsonld(c):
    return json.dumps({
        "@context": "https://schema.org", "@type": "FAQPage",
        "mainEntity": [{"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": a}} for q, a in c["faq"]],
    }, ensure_ascii=False)


def breadcrumb_jsonld(c):
    return json.dumps({
        "@context": "https://schema.org", "@type": "BreadcrumbList",
        "itemListElement": [
            {"@type": "ListItem", "position": 1, "name": "Home", "item": f"{BASE}/"},
            {"@type": "ListItem", "position": 2, "name": "Locations", "item": f"{BASE}/locations/"},
            {"@type": "ListItem", "position": 3, "name": f"Car Financing {c['name']}", "item": f"{BASE}/locations/{c['slug']}/"},
        ],
    }, ensure_ascii=False)


NAV = """  <nav class="nav scrolled" id="nav">
    <div class="nav-inner">
      <a href="/index.html" class="nav-logo">
        <img class="logo-mark logo-img" src="/images/logo.png" alt="DanGM logo, personal GM consultant in Coquitlam BC">
        <span class="logo-text">dangm<em>.ca</em></span>
      </a>
      <div class="nav-links">
        <a href="/index.html">Home</a>
        <a href="/inventory.html">Inventory</a>
        <a href="/locations/" class="active">Locations</a>
        <a href="/blog/">Guides</a>
        <a href="/forum/">Forum</a>
        <a href="/about.html">About</a>
      </div>
      <button class="nav-toggle" id="navToggle" aria-label="Menu">☰</button>
      <a href="/inventory.html" class="nav-cta">View Inventory</a>
    </div>
  </nav>
"""

LEAD = """  <section class="lead" id="lead">
    <div class="lead-inner">
      <div class="lead-copy">
        <p class="eyebrow">START HERE</p>
        <h2 class="section-title">Talk to Dan, no pressure, ever</h2>
        <p class="section-sub">Tell us what you need and Dan calls you personally. Bad credit, bankruptcy, new-to-Canada, trade-ins: 30 seconds is all it takes.</p>
        <ul class="lead-points">
          <li>✓ High approval rate: bad credit, bankruptcy, and no credit welcome</li>
          <li>✓ New-to-Canada programs: no Canadian credit history, no problem</li>
          <li>✓ Every vehicle hand-picked and personally inspected</li>
          <li>✓ Honest numbers in writing before you visit</li>
        </ul>
      </div>
      <form class="lead-form" id="leadForm" novalidate>
        <input type="text" name="website" id="leadWebsite" class="lead-hp" tabindex="-1" autocomplete="off" aria-hidden="true">
        <div class="lead-field">
          <label for="leadName">Full name</label>
          <input type="text" id="leadName" name="name" required maxlength="100" placeholder="Your name">
        </div>
        <div class="lead-field">
          <label for="leadPhone">Phone number</label>
          <input type="tel" id="leadPhone" name="phone" required maxlength="20" placeholder="604 555 1234">
        </div>
        <div class="lead-field">
          <label for="leadEmail">Email <span class="lead-optional">(optional)</span></label>
          <input type="email" id="leadEmail" name="email" maxlength="120" placeholder="you@email.com">
        </div>
        <div class="lead-field">
          <label for="leadInterest">How can we help?</label>
          <select id="leadInterest" name="interest" required>
            <option value="">Choose one…</option>
            <option>New to Canada Program</option>
            <option>Rebuild My Credit</option>
            <option>Trade-In Appraisals</option>
            <option>General Vehicle Inquiry</option>
          </select>
        </div>
        <button type="submit" class="btn btn-primary lead-submit" id="leadSubmit">Get Started with Dan</button>
        <p class="lead-error" id="leadError" hidden></p>
        <p class="lead-note">Your info stays private and is only used to contact you about your inquiry. Zero-pressure consultation: if we're not the right fit, we'll say so.</p>
      </form>
    </div>
  </section>
"""

FOOTER = """  <footer class="footer">
    <div class="footer-inner">
      <div class="footer-brand">
        <img class="logo-mark logo-img" src="/images/logo.png" alt="DanGM logo, personal GM consultant in Coquitlam BC">
        <span class="logo-text">dangm<em>.ca</em></span>
      </div>
      <p>© <span id="year"></span> dangm.ca. All rights reserved.</p>
      <nav class="footer-links" style="display:flex;flex-wrap:wrap;gap:1.5rem;justify-content:center;margin-top:14px" aria-label="Footer">
        <a href="/inventory.html">Inventory</a>
        <a href="/locations/">Locations</a>
        <a href="/blog/">Car Buying Guides</a>
        <a href="/forum/">Forum</a>
        <a href="/about.html">About</a>
      </nav>
    </div>
  </footer>
"""

CITY_TMPL = """<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <link rel="icon" type="image/png" sizes="64x64" href="/images/favicon.png">
  <link rel="apple-touch-icon" href="/images/apple-touch-icon.png">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{title}</title>
  <meta name="description" content="{desc}">
  <meta name="robots" content="index, follow, max-image-preview:large">
  <meta name="geo.region" content="CA-BC">
  <meta name="geo.placename" content="{name}, Metro Vancouver, BC">
  <meta name="geo.position" content="49.2872;-122.8131">
  <meta name="ICBM" content="49.2872, -122.8131">
  <link rel="alternate" hreflang="en-CA" href="{url_rstrip}">
  <link rel="alternate" hreflang="x-default" href="{url_rstrip}">
  <link rel="canonical" href="{url_rstrip}">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="DanGM">
  <meta property="og:title" content="{title}">
  <meta property="og:description" content="{ogdesc}">
  <meta property="og:url" content="{url_rstrip}">
  <meta property="og:image" content="{BASE}/images/banners/{banner}">
  <meta property="og:locale" content="en_CA">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="{title}">
  <meta name="twitter:description" content="{ogdesc}">
  <meta name="twitter:image" content="{BASE}/images/banners/{banner}">
  <script type="application/ld+json">{service_ld}</script>
  <script type="application/ld+json">{faq_ld}</script>
  <script type="application/ld+json">{breadcrumb_ld}</script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/css/styles.css?v={css_v}">
</head>
<body class="page-inventory">
{nav}
  <header class="page-hero" id="top">
    <div class="page-hero-bg"></div>
    <div class="page-hero-content">
      <p class="hero-eyebrow reveal">{eyebrow}</p>
      <h1 class="page-hero-title reveal">{h1}</h1>
      <p class="page-hero-sub reveal">{sub}</p>
      <div class="hero-actions reveal">
        <a href="{phone_href}" class="btn btn-primary">Call {phone}</a>
        <a href="/#lead" class="btn btn-ghost">Apply for Financing Approval</a>
      </div>
    </div>
  </header>

  <section class="inventory" id="{slug}-financing">
    <div class="about-page-body">
      {intro}
    </div>
    <div style="text-align:center;margin:36px auto 8px;max-width:720px">
      <img src="/images/banners/{banner}" alt="{banner_alt}" width="800" height="450" style="max-width:100%;height:auto;border-radius:16px" loading="lazy">
    </div>
  </section>

  {modules}

  <section class="cta-band" id="{slug}-cta" style="background:linear-gradient(135deg,#0b1220 0%,#132a4a 100%);color:#fff;padding:60px 24px;text-align:center">
    <div style="max-width:760px;margin:0 auto">
      <p class="eyebrow" style="color:#7fb2ff;letter-spacing:.14em;font-weight:700">{name_upper}, LET US GET YOU APPROVED</p>
      <h2 class="section-title" style="color:#fff;margin:8px 0 14px">Bad credit is not the end of your {name} car search</h2>
      <p style="font-size:1.1rem;line-height:1.7;color:#d6e2f5">Bad credit, a bankruptcy in your past, or zero Canadian credit history. None of it stops you from driving. Dan is a personal GM consultant who works for you, not a commission desk, and he gets Lower Mainland drivers approved every week with honest numbers in writing before you visit. One call is all it takes to find out what you qualify for today.</p>
      <div style="display:flex;flex-wrap:wrap;gap:16px;justify-content:center;margin-top:30px">
        <a href="{phone_href}" class="btn btn-primary" style="font-size:1.15rem;padding:18px 34px">Call {phone} now</a>
        <a href="/#lead" class="btn btn-ghost" style="font-size:1.15rem;padding:18px 34px;border-color:#7fb2ff;color:#fff">Apply for Financing Approval</a>
        <a href="/inventory.html" class="btn btn-ghost" style="font-size:1.15rem;padding:18px 34px;border-color:#7fb2ff;color:#fff">Browse Inventory</a>
      </div>
    </div>
  </section>

{lead}

  <section class="faq" id="faq">
    <div class="section-head">
      <p class="eyebrow">{name_upper} FAQ</p>
      <h2 class="section-title">Questions {name} buyers ask</h2>
    </div>
    <div class="faq-grid">
      {faq_html}
    </div>
  </section>

  <section class="inventory" id="other-cities">
    <div class="section-head">
      <p class="eyebrow">NEARBY</p>
      <h2 class="section-title">Car financing in nearby cities</h2>
    </div>
    <ul style="max-width:820px;margin:0 auto;line-height:2">
      {neighbors}
    </ul>
  </section>

{footer}
  <script>
    window.SITE_PAGE = 'landing';
    window.SITE_CONFIG = {{ apiBase: 'https://eagle-ridge-trucks.fblister.workers.dev/api' }};
  </script>
  <script src="/js/main.js?v={js_v}"></script>
</body>
</html>
"""

HUB_TMPL = """<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <link rel="icon" type="image/png" sizes="64x64" href="/images/favicon.png">
  <link rel="apple-touch-icon" href="/images/apple-touch-icon.png">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Car Loans &amp; Bad Credit Auto Financing in the Lower Mainland | DanGM</title>
  <meta name="description" content="Bad credit, bankruptcy, or new to Canada? DanGM gets Lower Mainland drivers approved for a GMC or Chevrolet. Find your city and apply. Call 604-735-1396.">
  <meta name="robots" content="index, follow, max-image-preview:large">
  <meta name="geo.region" content="CA-BC">
  <meta name="geo.placename" content="Metro Vancouver, BC">
  <meta name="geo.position" content="49.2872;-122.8131">
  <meta name="ICBM" content="49.2872, -122.8131">
  <link rel="alternate" hreflang="en-CA" href="{BASE}/locations/">
  <link rel="alternate" hreflang="x-default" href="{BASE}/locations/">
  <link rel="canonical" href="{BASE}/locations/">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="DanGM">
  <meta property="og:title" content="Car Loans &amp; Bad Credit Auto Financing in the Lower Mainland | DanGM">
  <meta property="og:description" content="Bad credit, bankruptcy, or new to Canada? DanGM gets Lower Mainland drivers approved for a GMC or Chevrolet. Find your city and apply.">
  <meta property="og:url" content="{BASE}/locations/">
  <meta property="og:image" content="{BASE}/images/banners/chevrolet-suv-bad-credit-financing-lower-mainland.svg">
  <meta property="og:locale" content="en_CA">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="Car Loans &amp; Bad Credit Auto Financing in the Lower Mainland | DanGM">
  <meta name="twitter:description" content="Bad credit, bankruptcy, or new to Canada? Find your city and apply with DanGM.">
  <meta name="twitter:image" content="{BASE}/images/banners/chevrolet-suv-bad-credit-financing-lower-mainland.svg">
  <script type="application/ld+json">{itemlist_ld}</script>
  <script type="application/ld+json">{breadcrumb_ld}</script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/css/styles.css?v={css_v}">
</head>
<body class="page-inventory">
{nav}
  <header class="page-hero" id="top">
    <div class="page-hero-bg"></div>
    <div class="page-hero-content">
      <p class="hero-eyebrow reveal visible">SERVING THE LOWER MAINLAND, BC</p>
      <h1 class="page-hero-title reveal visible">Car Financing in Your City</h1>
      <p class="page-hero-sub reveal visible">One personal GM consultant, honest numbers, and zero pressure, for drivers across the Tri-Cities, Metro Vancouver, and the Fraser Valley.</p>
    </div>
  </header>

  <section class="inventory" id="cities">
    <div class="forum-grid" id="cityList">
      {cards}
    </div>
    <div style="text-align:center;margin:36px auto 0;max-width:820px">
      <img src="/images/banners/chevrolet-suv-bad-credit-financing-lower-mainland.svg" alt="chevrolet-suv-bad-credit-financing-lower-mainland" width="800" height="450" style="max-width:100%;height:auto;border-radius:16px" loading="lazy">
      <p style="margin-top:24px">Not sure which city applies to you? <a href="/#lead">Ask Dan directly</a> or call 604-735-1396. Every driver in the Lower Mainland is welcome.</p>
    </div>
  </section>
{footer}
  <script>
    window.SITE_PAGE = 'landing';
    window.SITE_CONFIG = {{ apiBase: 'https://eagle-ridge-trucks.fblister.workers.dev/api' }};
  </script>
  <script src="/js/main.js?v={js_v}"></script>
</body>
</html>
"""


def render_city(c, all_cities):
    url = f"{BASE}/locations/{c['slug']}/"
    intro = "\n      ".join(f"<p{'' if i == 0 else ' style=\"margin-top:20px\"'}>{p}</p>" for i, p in enumerate(c["intro"]))
    modules = "\n\n  ".join(
        "  <section class=\"inventory\" id=\"%s-%d\">\n    <div class=\"about-page-body\">\n      <h2>%s</h2>\n      %s\n    </div>\n  </section>" % (
            c["slug"], i, esc(h2), "\n      ".join(f'<p{"" if j == 0 else " style=\"margin-top:20px\""}>{p}</p>' for j, p in enumerate(paras)))
        for i, (h2, paras) in enumerate(c["modules"])
    )
    faq_html = "\n      ".join(
        f'<details class="faq-item"><summary class="faq-q">{esc(q)}</summary><p class="faq-a">{esc(a)}</p></details>'
        for q, a in c["faq"])
    others = [x for x in all_cities if x["slug"] != c["slug"]][:5]
    neighbors = "\n      ".join(f'<li><a href="/locations/{o["slug"]}/">Car financing in {esc(o["name"])}</a></li>' for o in others)
    return CITY_TMPL.format(
        BASE=BASE, css_v=CSS_V, js_v=JS_V, nav=NAV, footer=FOOTER, lead=LEAD,
        title=esc(c["title"]), desc=esc(c["desc"]),
        ogdesc=esc(f"Bad credit, bankruptcy, or no Canadian credit history? {c['name']} drivers get approved through DanGM, in partnership with Eagle Ridge GM. Call {PHONE}."),
        url_rstrip=url.rstrip("/"), name=esc(c["name"]), name_upper=esc(c["name"].upper()),
        h1=esc(c["h1"]), eyebrow=esc(c["eyebrow"]), sub=esc(c["sub"]),
        banner=c["banner"], banner_alt=esc(c["banner_alt"]),
        intro=intro, modules=modules, faq_html=faq_html, neighbors=neighbors,
        phone=PHONE, phone_href=PHONE_HREF, slug=c["slug"],
        service_ld=service_jsonld(c), faq_ld=faq_jsonld(c), breadcrumb_ld=breadcrumb_jsonld(c),
    )


def render_hub(cities):
    cards = "\n      ".join(
        '<a class="forum-card reveal in-view" href="/locations/%s/">\n'
        '        <div class="forum-card-body">\n'
        '          <h2 class="forum-card-title">Car Financing in %s</h2>\n'
        '          <p class="forum-card-sub">Bad credit, bankruptcy, and new-to-Canada car buying for %s drivers. Call 604-735-1396.</p>\n'
        '          <span class="forum-card-cta">View %s financing →</span>\n'
        '        </div>\n      </a>' % (c["slug"], esc(c["name"]), esc(c["name"]), esc(c["name"]))
        for c in cities)
    itemlist_ld = json.dumps({
        "@context": "https://schema.org", "@type": "ItemList",
        "itemListElement": [
            {"@type": "ListItem", "position": i + 1, "name": f"Car Financing {c['name']}", "url": f"{BASE}/locations/{c['slug']}/"}
            for i, c in enumerate(cities)],
    }, ensure_ascii=False)
    breadcrumb_ld = json.dumps({
        "@context": "https://schema.org", "@type": "BreadcrumbList",
        "itemListElement": [
            {"@type": "ListItem", "position": 1, "name": "Home", "item": f"{BASE}/"},
            {"@type": "ListItem", "position": 2, "name": "Locations", "item": f"{BASE}/locations/"},
        ],
    }, ensure_ascii=False)
    return HUB_TMPL.format(BASE=BASE, css_v=CSS_V, js_v=JS_V, nav=NAV, footer=FOOTER,
                           cards=cards, itemlist_ld=itemlist_ld, breadcrumb_ld=breadcrumb_ld)


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    urls = []
    for c in CITIES:
        d = os.path.join(OUT_DIR, c["slug"])
        os.makedirs(d, exist_ok=True)
        with open(os.path.join(d, "index.html"), "w", encoding="utf-8") as f:
            f.write(render_city(c, CITIES))
        urls.append(
            f"  <url>\n    <loc>{BASE}/locations/{c['slug']}/</loc>\n"
            f"    <changefreq>monthly</changefreq>\n    <priority>0.8</priority>\n"
            f"    <lastmod>{TODAY}</lastmod>\n  </url>"
        )
    with open(os.path.join(OUT_DIR, "index.html"), "w", encoding="utf-8") as f:
        f.write(render_hub(CITIES))
    urls.append(
        f"  <url>\n    <loc>{BASE}/locations/</loc>\n"
        f"    <changefreq>monthly</changefreq>\n    <priority>0.7</priority>\n"
        f"    <lastmod>{TODAY}</lastmod>\n  </url>"
    )
    xml = ('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
           + "\n".join(urls) + "\n</urlset>\n")
    with open(OUT_SITEMAP, "w", encoding="utf-8") as f:
        f.write(xml)
    print(f"Wrote {len(CITIES)} city pages + hub -> {os.path.abspath(OUT_DIR)}")
    print(f"Wrote {len(CITIES) + 1} location URLs -> {os.path.abspath(OUT_SITEMAP)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
