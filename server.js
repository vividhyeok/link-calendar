require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Client } = require('@notionhq/client');

const app = express();
const port = process.env.PORT || 3000;

// Initialize Notion Client
const notion = new Client({ auth: process.env.NOTION_API_KEY });
const databaseId = process.env.NOTION_DATABASE_ID;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public')); // Serve static files from 'public' directory

// API endpoint to get calendar data
app.get('/api/calendar', async (req, res) => {
    let calendarId = req.query.id;
    
    // If no id provided, try to construct from year and month parameters
    if (!calendarId) {
        const year = req.query.year;
        const month = req.query.month;
        
        if (year && month) {
            // Convert to calendar_id format: 2025-06 (hyphen format to match Notion data)
            calendarId = `${year}-${month.padStart(2, '0')}`;
        }
    }

    if (!calendarId) {
        return res.status(400).json({ error: 'Calendar ID or year/month parameters are required' });
    }

    console.log(`Fetching calendar data for ID: ${calendarId}`);
    console.log(`Using database ID: ${databaseId}`);
    console.log(`Notion API key configured: ${process.env.NOTION_API_KEY ? 'Yes' : 'No'}`);

    try {
        const response = await notion.databases.query({
            database_id: databaseId,
            filter: {
                property: 'calendar_id',
                rich_text: {
                    equals: calendarId,
                },
            },
        });

        console.log(`Notion API response: Found ${response.results.length} records`);

        // Map Notion's response to the format expected by the frontend
        const events = response.results.map(page => {
            const props = page.properties;
            
            // Extract start and end dates - try multiple possible field names
            const startDate = props.start_date?.date?.start || props[' start_date']?.date?.start;
            let endDate = props.end_date?.date?.start || props[' end_date']?.date?.start;
            
            // If end_date has an end property (date range), use that
            if (props.end_date?.date?.end) {
                endDate = props.end_date.date.end;
            } else if (props[' end_date']?.date?.end) {
                endDate = props[' end_date'].date.end;
            }
            
            // If no explicit end date, use start date as end date
            if (!endDate && startDate) {
                endDate = startDate;
            }
            
            console.log(`Event: ${props.title?.rich_text[0]?.plain_text}, Start: ${startDate}, End: ${endDate}`);
            
            return {
                title: props.title?.rich_text[0]?.plain_text || props.link_calendar?.title[0]?.plain_text || '제목 없음',
                start: startDate,
                end: endDate,
                description: props.description?.rich_text[0]?.plain_text || '',
                // Read the checkbox properties
                holiday: props.holiday?.checkbox || false,
                school_event: props.school_event?.checkbox || false,
                department_event: props.department_event?.checkbox || false,
                exam_period: props.exam_period?.checkbox || false,
            };
        });

        // The frontend expects a specific structure with a title
        // Extract year and month from calendar_id (format: 2025-06)
        const [year, month] = calendarId.split('-');
        res.json({
            title: `${year}년 ${month}월 일정`,
            events: events,
        });

    } catch (error) {
        console.error('Error fetching from Notion:', error);
        console.error('Error details:', {
            message: error.message,
            code: error.code,
            status: error.status
        });
        res.status(500).json({ 
            error: 'Failed to fetch data from Notion', 
            details: error.message 
        });
    }
});

// Test endpoint to check Notion API connection
app.get('/api/test', async (req, res) => {
    try {
        // Test basic API connection
        const response = await notion.users.me();
        res.json({
            status: 'success',
            message: 'Notion API connection successful',
            bot: response
        });
    } catch (error) {
        console.error('Notion API test failed:', error);
        res.status(500).json({
            status: 'error',
            message: 'Notion API connection failed',
            details: error.message
        });
    }
});

// Debug endpoint to check Notion database schema
app.get('/api/debug/schema', async (req, res) => {
    try {
        const response = await notion.databases.retrieve({
            database_id: databaseId,
        });
        
        res.json({
            title: response.title,
            properties: Object.keys(response.properties),
            propertyDetails: response.properties
        });
    } catch (error) {
        console.error('Error fetching database schema:', error);
        res.status(500).json({ error: 'Failed to fetch database schema', details: error.message });
    }
});

// Debug endpoint to find databases in a page
app.get('/api/debug/find-databases', async (req, res) => {
    try {
        // Get the page content
        const pageResponse = await notion.pages.retrieve({
            page_id: databaseId,
        });
        
        // Search for databases in the page
        const blockResponse = await notion.blocks.children.list({
            block_id: databaseId,
        });
        
        const databases = blockResponse.results.filter(block => 
            block.type === 'child_database' || block.type === 'database'
        );
        
        res.json({
            pageTitle: pageResponse.properties.title?.title[0]?.plain_text || 'No title',
            totalBlocks: blockResponse.results.length,
            databases: databases,
            allBlocks: blockResponse.results.map(block => ({
                id: block.id,
                type: block.type,
                hasChildren: block.has_children
            }))
        });
    } catch (error) {
        console.error('Error finding databases:', error);
        res.status(500).json({ error: 'Failed to find databases', details: error.message });
    }
});

// Debug endpoint to get all records without filter
app.get('/api/debug/all-records', async (req, res) => {
    try {
        const response = await notion.databases.query({
            database_id: databaseId,
            // No filter - get all records
        });
        
        res.json({
            totalRecords: response.results.length,
            records: response.results.map(page => ({
                id: page.id,
                properties: page.properties,
                // Show the actual structure
                calendar_id: page.properties.calendar_id,
                title: page.properties.title
            }))
        });
    } catch (error) {
        console.error('Error fetching all records:', error);
        res.status(500).json({ error: 'Failed to fetch all records', details: error.message });
    }
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
    console.log('Serving static files from public directory.');
    console.log('Access your calendar at http://localhost:3000/index.html?year=2025&month=06 (or another valid year/month)');
});
