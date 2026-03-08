# SaveHydroo 💧

**Smart Water Blending and Monitoring System**

A fully software-based simulation of an intelligent water management system that blends RO reject water with rainwater to achieve optimal TDS levels.

![Dashboard Preview](frontend/assets/dashboard-preview.png)

## 🌟 Features

### Real-Time Simulation
- **3 Tank System**: RO Reject, Rainwater, and Blended tanks
- **Sensor Simulation**: TDS, Temperature, Water Level, Flow Rate
- **Dynamic Blending**: Adjustable blend ratios with real-time mixing
- **Wokwi Compatible**: Arduino simulation files included

### ML Predictions
- **TDS Forecasting**: Linear regression-based future TDS prediction
- **Time Estimates**: Time to reach target TDS, time to fill tank
- **Optimal Blend Calculation**: Auto-calculate best ratio for target TDS

### Gamification
- **Points System**: Earn points for water-saving actions
- **5 Levels**: Water Beginner → Aqua Legend
- **Achievements & Badges**: Unlock rewards for milestones
- **Leaderboard**: Compete with other users

### Payment Simulation
- **Credit Packages**: Buy virtual credits
- **Premium Features**: Unlock advanced analytics
- **Donations**: Donate to causes and earn bonus points
- **Transaction History**: Full payment tracking

## 📁 Project Structure

```
savehydroo/
├── simulation/           # Wokwi simulation layer
│   ├── wokwi.toml       # Wokwi configuration
│   ├── diagram.json     # Circuit diagram
│   ├── main.ino         # Arduino code
│   └── sensors.js       # JS data generator
├── frontend/            # Web dashboard
│   ├── index.html       # Main HTML
│   ├── css/styles.css   # Styling
│   └── js/              # JavaScript modules
├── api/                 # Vercel serverless functions
│   ├── sensor-data.js
│   ├── predictions.js
│   ├── gamification.js
│   ├── payments.js
│   └── simulation.js
├── lib/                 # Shared libraries
│   ├── constants.js
│   ├── supabase.js
│   └── ml-predictor.js
├── supabase/
│   └── schema.sql       # Database schema
├── data/
│   └── sample-data.json
├── package.json
├── vercel.json
└── README.md
```

## 🚀 Local Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Open browser
http://localhost:3000
```

## ☁️ Azure Cloud Deployment (CI/CD)

The application is configured to automatically build and deploy to **Azure Container Apps** every time you push to the `main` branch via GitHub Actions.

### Deployment Prerequisites

To enable automatic deployments, you must configure the following **7 Secrets** in your GitHub Repository under **Settings → Secrets and variables → Actions**:

**Azure Secrets:**
1. `REGISTRY_LOGIN_SERVER`: Example: `yourregistry.azurecr.io`
2. `REGISTRY_USERNAME`: Your Azure Container Registry username
3. `REGISTRY_PASSWORD`: Your Azure Container Registry password
4. `AZURE_CREDENTIALS`: The full JSON output from your Azure Service Principal creation

**Supabase Secrets:**
5. `SUPABASE_URL`: Your Supabase Project URL
6. `SUPABASE_ANON_KEY`: Your Supabase public anon key
7. `SUPABASE_SERVICE_ROLE_KEY`: Your Supabase private service role key (required for Edge Functions)

Once these secrets are active, simply push your code to the `main` branch or manually trigger the `SaveHydroo CI/CD → Azure Container Apps` workflow in the **Actions** tab.

## ⚙️ Supabase Setup

1. Create a new Supabase project
2. Run `supabase/schema.sql` in the SQL Editor to generate the tables
3. Deploy the Edge Functions: `supabase functions deploy ml-predict`

## 📊 API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/simulation/step` | GET | Get next simulation reading |
| `/api/simulation/reset` | POST | Reset simulation |
| `/api/sensor-data` | GET/POST | Read/save sensor data |
| `/api/predictions/calculate` | POST | Calculate ML predictions |
| `/api/gamification/stats` | GET | User stats |
| `/api/gamification/leaderboard` | GET | Global leaderboard |
| `/api/payments/initiate` | POST | Start payment |

## 🎮 Gamification Points

| Action | Points |
|--------|--------|
| Use 10L+ rainwater | +10 |
| Reduce RO reject 5% | +15 |
| Maintain optimal TDS 1hr | +20 |
| Daily login streak | +5 × days |

## 🔧 Tech Stack

- **Frontend**: HTML, CSS, JavaScript, Chart.js
- **Backend**: Vercel Serverless Functions
- **Database**: Supabase (PostgreSQL)
- **Simulation**: Wokwi, Custom JS Simulator
- **ML**: Custom Linear Regression

## 🧪 Testing

```bash
# API tests
npm run test:api

# Simulation test
npm run simulate:test
```

## 📱 Screenshots

### Dashboard
- Real-time tank visualization
- Live TDS, temperature, flow metrics
- Interactive blend controls

### Charts
- TDS over time with optimal zone
- Water level trends
- Temperature monitoring

### Gamification
- Level progress with XP bar
- Achievement badges
- Global leaderboard

## 📄 License

MIT License - feel free to use for learning and projects!

---

Built with 💙 for water conservation
